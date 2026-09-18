import { NextResponse } from "next/server";
import { sarvamChat, type ChatMessage } from "@/lib/sarvam";
import { findTaskInLoaded, loadDistrictById } from "@/lib/game/load-district";
import { taskGraderSystemPrompt, taskTalkSystemPrompt } from "@/lib/game/task-conversation";
import type { LessonStep } from "@/lib/game/districts";
import type { NpcTurn } from "@/lib/game/npc-memory";
import { getPostHogClient } from "@/lib/posthog-server";
import { targetScriptShare } from "@/lib/game/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

type Turn = { who: "player" | "npc"; text: string };

type Body = {
  districtId: string;
  taskId: string;
  /** Omit on the opening beat; required on player turns. */
  playerText?: string;
  transcript?: Turn[];
  /** Tier lesson used for phrase targets and difficulty hints. */
  lesson?: LessonStep[];
  memory?: NpcTurn[];
};

type Graded = {
  reply: string;
  checks: boolean[];
  phrasesUsed: string[];
  englishFallback: boolean;
  outcomeAchieved: boolean;
  hint: string | null;
};

function parse(raw: string, checkCount: number): Graded {
  const attempt = (text: string): Graded | null => {
    try {
      const p = JSON.parse(text);
      if (typeof p?.reply !== "string") return null;
      // Only a real boolean true passes. `.map(Boolean)` turned the string
      // "false" into true, so a model that quoted its booleans could complete
      // a mission with every check failing. Anything malformed counts as false.
      const checks: boolean[] = Array.isArray(p.checks)
        ? p.checks.slice(0, checkCount).map((c: unknown) => c === true)
        : [];
      while (checks.length < checkCount) checks.push(false);
      return {
        reply: p.reply.trim(),
        checks,
        phrasesUsed: Array.isArray(p.phrases_used) ? p.phrases_used.map(String) : [],
        englishFallback: p.english_fallback === true,
        outcomeAchieved: p.outcome_achieved === true,
        hint: typeof p.hint === "string" && p.hint.trim() ? p.hint.trim() : null,
      };
    } catch {
      return null;
    }
  };

  const direct = attempt(raw.trim());
  if (direct) return direct;

  const braced = raw.match(/\{[\s\S]*\}/);
  if (braced) {
    const salvaged = attempt(braced[0]);
    if (salvaged) return salvaged;
  }

  return {
    reply: raw.replace(/```/g, "").trim(),
    checks: new Array(checkCount).fill(false),
    phrasesUsed: [],
    englishFallback: false,
    outcomeAchieved: false,
    hint: null,
  };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const loaded = await loadDistrictById(body.districtId);
  if (!loaded) {
    return NextResponse.json({ error: `unknown district: ${body.districtId}` }, { status: 404 });
  }
  const district = loaded.district;
  const task = findTaskInLoaded(loaded, body.taskId);
  if (!task) {
    return NextResponse.json({ error: `unknown task: ${body.taskId}` }, { status: 404 });
  }
  if (task.districtId !== district.id) {
    return NextResponse.json({ error: "Task not in this district." }, { status: 404 });
  }

  // Everything below comes from the browser and goes into the model's prompt,
  // so it is bounded and, where the server knows the truth, checked against
  // it. The lesson is the obvious case: accept only steps this task really
  // teaches, so a crafted request cannot plant its own "target phrases".
  const clip = (text: unknown, max: number) => (typeof text === "string" ? text.slice(0, max) : "");
  const taught = new Set(
    Object.values(task.lessons ?? {}).flatMap((steps) => (steps ?? []).map((st) => st.prompt?.native)),
  );
  const offered = Array.isArray(body.lesson) ? body.lesson : [];
  const genuine = offered.filter((st) => st?.prompt?.native && taught.has(st.prompt.native));
  const lesson = genuine.length ? genuine : (task.lessons?.medium ?? []);
  const memory = (Array.isArray(body.memory) ? body.memory : [])
    .slice(-8)
    .map((t) => ({ ...t, content: clip(t?.content, 300) }));
  const transcript = (Array.isArray(body.transcript) ? body.transcript : [])
    .slice(-12)
    .map((t) => ({ who: t?.who === "player" ? ("player" as const) : ("npc" as const), text: clip(t?.text, 400) }));
  const checkCount = 3;

  const system = taskTalkSystemPrompt(district, task, lesson, memory);

  const history: ChatMessage[] = transcript.slice(-10).map((t) => ({
    role: t.who === "player" ? ("user" as const) : ("assistant" as const),
    content: t.text,
  }));

  // A spoken turn is a sentence or two; 400 characters is generous.
  const playerText = typeof body.playerText === "string" ? body.playerText.trim().slice(0, 400) : undefined;
  const isOpening = !playerText && transcript.length === 0;

  if (!isOpening && !playerText) {
    return NextResponse.json({ error: "playerText is required after the opening." }, { status: 400 });
  }

  const userContent = isOpening
    ? "The player has just walked up to you. Open with one short in-character line that starts this errand."
    : playerText!;

  let raw: string;
  try {
    raw = await sarvamChat(
      [{ role: "system", content: system }, ...history, { role: "user", content: userContent }],
      { temperature: 0.85, maxTokens: 450, responseFormat: { type: "json_object" } }
    );
  } catch (err) {
    console.error("task-talk failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed." },
      { status: 502 }
    );
  }

  const graded = parse(raw, checkCount);
  const playerTurns = transcript.filter((t) => t.who === "player").length + (playerText ? 1 : 0);
  // The model's outcome flag alone is not enough: a reply that says "done"
  // while its own checks say the player never spoke the language, or never
  // got the result, is contradicting itself, and a mission must not complete
  // on contradictory output. Speaking the language (check 1) and the outcome
  // itself (check 3) are required. Check 2, answering what was asked, is
  // reported but not gating, since a final "yes, let's go" turn can close a
  // deal without directly answering the NPC's last line.
  const [spokeLanguage, , gotOutcome] = graded.checks;

  // The model's "spoke the language" check is not reliable on its own: in
  // testing it passed a player who spoke only English. So three signals must
  // agree: the grader's language check, no English fallback, and at least 40%
  // of the closing turn's letters in the target script (loanwords keep real
  // short Hindi sentences below a majority). The script share is a
  // supporting signal, not proof. It stops "Please take me to the station अ"
  // passing, but it cannot tell whether a correctly scripted sentence said
  // anything useful, which is the grader's job.
  const heldInLanguage =
    spokeLanguage === true &&
    graded.englishFallback !== true &&
    targetScriptShare(playerText ?? "", district.script) >= 0.4;

  let outcomeAchieved =
    graded.outcomeAchieved && gotOutcome === true && heldInLanguage && playerTurns >= 1;

  // One call is both the NPC and the grader, and in testing it missed deals it
  // had just agreed to in its own reply about a third of the time, leaving an
  // honest learner with no way to finish. When it has not completed, ask a
  // second, single-purpose grader that sees the whole exchange *including*
  // this reply. It only runs on turns that did not already succeed, so a
  // clean completion costs no extra latency, and it can only confirm an
  // outcome in a conversation that was held in the target language.
  //
  // Cost, measured against live Sarvam: the first call has a median of about
  // 1.45 s and this one about 0.56 s, so an eligible turn that does not
  // complete waits roughly 2 s instead of 1.4 s before the NPC speaks. If that
  // becomes a problem, return the reply first and confirm the outcome while
  // its audio plays.
  if (!outcomeAchieved && !isOpening && playerTurns >= 2 && heldInLanguage) {
    const exchange = [...transcript, { who: "player" as const, text: playerText! }, { who: "npc" as const, text: graded.reply }]
      .map((t) => `${t.who === "player" ? "PLAYER" : task.name.toUpperCase()}: ${t.text}`)
      .join("\n");
    try {
      const second = await sarvamChat(
        [
          { role: "system", content: taskGraderSystemPrompt(district, task) },
          { role: "user", content: exchange },
        ],
        { temperature: 0.1, maxTokens: 120, responseFormat: { type: "json_object" } },
      );
      const match = second.match(/\{[\s\S]*\}/);
      const verdict = JSON.parse(match ? match[0] : second);
      if (verdict?.mission_complete === true) {
        outcomeAchieved = true;
        graded.checks[2] = true;
      }
    } catch (err) {
      // A failed second opinion leaves the first verdict standing.
      console.error("task-talk second grader failed", err);
    }
  }

  if (outcomeAchieved) {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: "anonymous",
      event: "errand_outcome_achieved",
      properties: {
        district_id: body.districtId,
        task_id: body.taskId,
        player_turns: playerTurns,
        checks_passed: graded.checks.filter(Boolean).length,
        checks_total: checkCount,
        phrases_used_count: graded.phrasesUsed.length,
        reward: task.reward,
        english_fallback: graded.englishFallback,
      },
    });
    await posthog.flush();
  }

  return NextResponse.json({
    reply: graded.reply,
    opening: isOpening,
    checks: graded.checks,
    checksPassed: graded.checks.filter(Boolean).length,
    checksTotal: checkCount,
    phrasesUsed: graded.phrasesUsed,
    englishFallback: graded.englishFallback,
    outcomeAchieved,
    hint: graded.hint,
    reward: outcomeAchieved ? task.reward : 0,
  });
}
