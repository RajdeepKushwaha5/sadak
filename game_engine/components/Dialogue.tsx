"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Volume2, X } from "lucide-react";
import type { District } from "@/lib/game/districts";
import type { NpcTurn } from "@/lib/game/npc-memory";
import type { LessonTarget } from "@/lib/game/tasks";
import { useVoice } from "@/lib/useVoice";
import { scoreAttempt, type WordVerdict } from "@/lib/game/speech-score";
import { looksLikeTargetScript } from "@/lib/game/prompt";
import { phraseKey } from "@/lib/game/due";
import { playSfx } from "@/lib/audio/sfx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gloss, ui } from "@/lib/i18n/gloss";
import { lessonTierUiKey } from "@/lib/i18n/ui-keys";
import type { BaseLangCode } from "@/lib/i18n/base-lang";
import { cn } from "@/lib/utils";
import posthog from "posthog-js";
import { ttsLookupKey } from "@/lib/tts/cache-keys";
import type { TtsPrefetchMap } from "@/lib/tts/prefetch-client";

/**
 * Send attempts to the review schedule, retrying once if the server failed.
 *
 * The drill and the errand must never wait on this, so callers fire and
 * forget. But a transient failure should not quietly lose a learner's
 * evidence either, so a 5xx or network error gets one more try after a short
 * pause. A 401 is final: signed-out play records nothing by design.
 */
async function saveReview(body: unknown, attempt = 0): Promise<void> {
  try {
    const res = await fetch("/api/phrase-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok || res.status < 500 || attempt > 0) return;
  } catch {
    if (attempt > 0) return;
  }
  await new Promise((r) => setTimeout(r, 1500));
  return saveReview(body, attempt + 1);
}

/**
 * The drill teaches the lines; the errand is where they have to work.
 *
 * Reciting a scripted line proves you can say it. It does not prove you
 * could get an auto to Bandra with it. `errand` is the transfer test: no
 * script, a person who will not switch to English, and a model judging
 * whether you were actually understood.
 */
type Phase = "review" | "recall" | "npc" | "player" | "result" | "errand" | "finished";

/** A phrase that has come due, asked for from memory before the drill shows it. */
export type ReviewPhrase = { native: string; roman: string; en: string };

/** Enough to measure recall, few enough not to delay the conversation. */
const MAX_REVIEW = 2;

export default function Dialogue({
  district,
  baseLang,
  target,
  priorMemory,
  onMemoryUpdate,
  onClose,
  onComplete,
  onPoints,
  ttsPrefetchRef,
  reviewPhrases = [],
  onReviewed,
}: {
  district: District;
  baseLang: BaseLangCode;
  target: LessonTarget;
  priorMemory: NpcTurn[];
  onMemoryUpdate: (turns: NpcTurn[]) => void;
  onClose: () => void;
  onComplete: (id: string, reward: number) => void;
  onPoints: (points: number) => void;
  ttsPrefetchRef?: RefObject<TtsPrefetchMap>;
  /** Due phrases this NPC teaches. Asked for before the answer is shown. */
  reviewPhrases?: ReviewPhrase[];
  onReviewed?: (native: string) => void;
}) {
  const steps = target.lesson;
  const hasPrior = priorMemory.length > 0;

  // Fixed at mount: the queue must not shift under the learner if the parent
  // removes a phrase once it has been answered.
  const [reviewQueue] = useState<ReviewPhrase[]>(() => reviewPhrases.slice(0, MAX_REVIEW));
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewDone, setReviewDone] = useState(reviewQueue.length === 0);
  /** The learner asked to see the line before answering: practice, not recall. */
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [reviewResult, setReviewResult] = useState<{
    points: number;
    verdicts: WordVerdict[];
    unaided: boolean;
  } | null>(null);
  const [reviewRetries, setReviewRetries] = useState<Set<number>>(new Set());
  const [reviewStats, setReviewStats] = useState({ asked: 0, recalled: 0 });
  const reviewItem = reviewQueue[reviewIndex];

  const [stepIndex, setStepIndex] = useState(0);
  const [recallDone, setRecallDone] = useState(!hasPrior);
  const [recallLine, setRecallLine] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(
    reviewQueue.length ? "review" : hasPrior ? "recall" : "npc",
  );
  const [errandTurns, setErrandTurns] = useState<{ who: "player" | "npc"; text: string }[]>([]);
  const [errandHint, setErrandHint] = useState<string | null>(null);
  const [errandBusy, setErrandBusy] = useState(false);
  const [errandChecks, setErrandChecks] = useState<boolean[]>([]);
  const [errandUsed, setErrandUsed] = useState<string[]>([]);
  /** Phrases already credited this errand. A ref, so two quick turns cannot
   *  both read stale state and credit the same phrase twice. */
  const creditedRef = useRef<Set<string>>(new Set());
  /** Evidence for the completion card: only what was actually observed. */
  const [errandHintsSeen, setErrandHintsSeen] = useState(0);
  const [errandFallbackTurns, setErrandFallbackTurns] = useState(0);
  const [attempt, setAttempt] = useState<{
    transcript: string;
    verdicts: WordVerdict[];
    points: number;
  } | null>(null);
  const [heardNothing, setHeardNothing] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [gradedCount, setGradedCount] = useState(0);
  /** Steps where a first attempt was waved through as a probable mishearing. */
  const [retryOffered, setRetryOffered] = useState<Set<number>>(new Set());
  const [misheard, setMisheard] = useState(false);
  const [npcSpeaking, setNpcSpeaking] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voice = useVoice(district.language);
  const finishedRef = useRef(false);
  const sessionTurnsRef = useRef<NpcTurn[]>([]);
  const onMemoryUpdateRef = useRef(onMemoryUpdate);
  onMemoryUpdateRef.current = onMemoryUpdate;

  const step = steps[stepIndex];

  // Live word colouring + accuracy while the mic is still open, reusing the
  // exact same scorer the committed grade uses so the meter never disagrees
  // with the "+N pts" that lands a moment later. Only drives the preview
  // layer — `attempt` (set in onMicUp) remains the sole source of the score.
  const live = useMemo(
    () =>
      step?.prompt && !attempt && voice.partial
        ? scoreAttempt(step.prompt.native, voice.partial)
        : null,
    [step, attempt, voice.partial]
  );

  const pushTurn = useCallback((turn: NpcTurn) => {
    const text = turn.content.trim();
    if (!text) return;
    sessionTurnsRef.current = [...sessionTurnsRef.current, { ...turn, content: text }];
  }, []);

  const playAudio = useCallback(
    async (text: string, onDone?: () => void) => {
      setTtsPlaying(true);
      try {
        const lookupKey = ttsLookupKey(district.language, target.speaker, text);
        const prefetched = ttsPrefetchRef?.current.get(lookupKey);
        const finish = () => {
          setTtsPlaying(false);
          onDone?.();
        };

        if (prefetched) {
          audioRef.current?.pause();
          const a = new Audio(prefetched);
          audioRef.current = a;
          a.onended = finish;
          a.onerror = finish;
          await a.play().catch(finish);
          return;
        }

        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ districtId: district.id, npcId: target.id, text }),
        });
        const { audio } = await res.json();
        if (!audio) {
          finish();
          return;
        }
        audioRef.current?.pause();
        const a = new Audio(audio);
        audioRef.current = a;
        a.onended = finish;
        a.onerror = finish;
        await a.play().catch(finish);
      } catch {
        setTtsPlaying(false);
        onDone?.();
      }
    },
    [district.id, district.language, target.id, target.speaker, ttsPrefetchRef]
  );

  const playNpcLine = useCallback(
    async (text: string, after: "player" | "lesson") => {
      setNpcSpeaking(true);
      await playAudio(text, () => {
        setNpcSpeaking(false);
        if (after === "player") setPhase("player");
        else setRecallDone(true);
      });
    },
    [playAudio]
  );

  const playPromptPronunciation = useCallback(() => {
    const native = step?.prompt?.native;
    if (!native?.trim()) return;
    void playAudio(native);
  }, [playAudio, step?.prompt?.native]);

  const retryLine = useCallback(() => {
    setAttempt(null);
    setHeardNothing(false);
    setPhase("player");
  }, []);

  const recallStartedRef = useRef(false);
  useEffect(() => {
    if (!hasPrior || !reviewDone || recallStartedRef.current) return;
    recallStartedRef.current = true;
    let cancelled = false;

    (async () => {
      setPhase("recall");
      try {
        const res = await fetch("/api/recall", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            districtId: district.id,
            taskId: target.id,
            memory: priorMemory,
          }),
        });
        const json = (await res.json()) as { reply?: string };
        if (cancelled) return;
        if (res.ok && json.reply?.trim()) {
          const line = json.reply.trim();
          setRecallLine(line);
          pushTurn({ role: "assistant", content: line });
          await playNpcLine(line, "lesson");
          if (!cancelled) setPhase("npc");
          return;
        }
      } catch {
        /* fall through to normal lesson */
      }
      if (!cancelled) setRecallDone(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewDone]);

  useEffect(() => {
    if (!reviewDone || !recallDone || !step) return;
    setPhase("npc");
    setAttempt(null);
    setHeardNothing(false);
    pushTurn({ role: "assistant", content: step.npc.native });
    playNpcLine(step.npc.native, "player");
    return () => {
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, recallDone, reviewDone]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      const turns = sessionTurnsRef.current;
      if (turns.length) onMemoryUpdateRef.current(turns);
    };
  }, []);

  const completeEncounter = useCallback(() => {
    setPhase("finished");
    if (!finishedRef.current) {
      finishedRef.current = true;
      playSfx("success");
      onComplete(target.id, target.reward);
    }
  }, [onComplete, target]);

  const advance = useCallback(() => {
    if (stepIndex + 1 >= steps.length) {
      // Lines learned. Now use them for something.
      setPhase("errand");
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length]);

  /**
   * One errand turn: whatever the player said goes to the model, which
   * replies in character *and* grades the conversation so far.
   *
   * Unlike the drill there is no expected string to diff against — the
   * question is whether the person in front of you understood and acted, so
   * the model's judgement is the score.
   */
  async function sendErrandTurn(playerText: string) {
    setErrandBusy(true);
    const transcript = [...errandTurns, { who: "player" as const, text: playerText }];
    setErrandTurns(transcript);

    try {
      const res = await fetch("/api/task-talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          districtId: district.id,
          taskId: target.id,
          playerText,
          transcript: errandTurns,
          lesson: steps,
          memory: priorMemory,
        }),
      });
      if (!res.ok) throw new Error("task-talk failed");
      const g = await res.json();

      setErrandTurns([...transcript, { who: "npc", text: g.reply }]);
      setErrandHint(g.hint ?? null);
      if (g.hint) setErrandHintsSeen((n) => n + 1);
      if (g.englishFallback === true) setErrandFallbackTurns((n) => n + 1);
      setErrandChecks(Array.isArray(g.checks) ? g.checks : []);
      pushTurn({ role: "user", content: playerText });
      pushTurn({ role: "assistant", content: g.reply });

      const used: string[] = Array.isArray(g.phrasesUsed) ? g.phrasesUsed : [];
      // The grader reads the whole conversation, so a phrase said on turn one
      // can be reported again on every turn after it. Each phrase earns one
      // review per errand, on the turn it first appears; crediting it again
      // would tell the scheduler it had been recalled several times when it
      // was said once.
      // Keyed on the normalised phrase and marked as each one is taken, so the
      // same line returned twice in one response, or with different
      // punctuation, is credited once. The server maps whatever survives onto
      // the exact lesson line and drops anything that is not one.
      const fresh: string[] = [];
      for (const p of used) {
        const key = phraseKey(p);
        if (!key || creditedRef.current.has(key)) continue;
        creditedRef.current.add(key);
        fresh.push(p);
      }
      if (fresh.length) {
        setErrandUsed((prev) => [...prev, ...fresh]);
        // Best-effort: a failed write must not interrupt the conversation.
        void saveReview({
          districtId: district.id,
          lang: district.language,
          used: fresh,
          englishFallback: g.englishFallback === true,
        });
      }

      posthog.capture("errand_turn_graded", {
        task_id: target.id,
        district_language: district.language,
        turns: transcript.length,
        checks_passed: (g.checks ?? []).filter(Boolean).length,
        phrases_used: used.length,
        english_fallback: g.englishFallback === true,
        outcome_achieved: g.outcomeAchieved === true,
      });

      await playAudio(g.reply);
      if (g.outcomeAchieved === true) {
        playSfx("success");
        completeEncounter();
      }
    } catch {
      setErrandHint("Line went quiet. Try that again.");
      playSfx("error");
    } finally {
      setErrandBusy(false);
    }
  }

  /**
   * One delayed-recall attempt: the learner saw only the meaning.
   *
   * This is the evidence the schedule most needs and the drill cannot give,
   * because the drill always shows the line. It is recorded with
   * answerVisible false only if the learner never asked to see it; revealing
   * first turns it into practice, capped at Hard like any read-aloud attempt.
   * One scored attempt per phrase: a second go after seeing the answer is
   * rehearsal, and counting it would blur exactly the distinction this exists
   * to measure.
   */
  function handleReviewAttempt(transcript: string) {
    if (!reviewItem) return;
    setHeardNothing(false);
    const scored = scoreAttempt(reviewItem.native, transcript);

    const offScript = !looksLikeTargetScript(transcript, district.script);
    const probableMishear = scored.points < 40 && (offScript || scored.points === 0);
    if (probableMishear && !reviewRetries.has(reviewIndex)) {
      setReviewRetries((prev) => new Set(prev).add(reviewIndex));
      setMisheard(true);
      playSfx("error");
      return;
    }
    setMisheard(false);

    const unaided = !reviewRevealed;
    setReviewResult({ points: scored.points, verdicts: scored.verdicts, unaided });
    setReviewStats((st) => ({
      asked: st.asked + 1,
      recalled: st.recalled + (unaided && scored.points >= 72 ? 1 : 0),
    }));
    void saveReview({
      districtId: district.id,
      lang: district.language,
      attempts: [{ phraseNative: reviewItem.native, points: scored.points, answerVisible: !unaided }],
    });
    onReviewed?.(reviewItem.native);
    posthog.capture("delayed_recall_attempted", {
      task_id: target.id,
      district_language: district.language,
      points: scored.points,
      unaided,
    });
    if (unaided && scored.points >= 72) playSfx("success");
    else if (scored.points >= 40) playSfx("partial");
    else playSfx("error");
  }

  function nextReview() {
    setReviewResult(null);
    setReviewRevealed(false);
    setMisheard(false);
    setHeardNothing(false);
    if (reviewIndex + 1 < reviewQueue.length) {
      setReviewIndex((i) => i + 1);
      return;
    }
    // Hand over to the normal opening, which was waiting on this.
    setPhase(hasPrior ? "recall" : "npc");
    setReviewDone(true);
  }

  async function onMicUp() {
    if (!voice.recording) return;
    playSfx("tap");
    const transcript = await voice.stop();

    if (!transcript) {
      setHeardNothing(true);
      playSfx("error");
      return;
    }

    if (phase === "review") {
      handleReviewAttempt(transcript);
      return;
    }

    if (phase === "errand") {
      await sendErrandTurn(transcript);
      return;
    }

    pushTurn({ role: "user", content: transcript });
    const scored = scoreAttempt(step.prompt.native, transcript);

    // Sarvam returns no confidence, so a mishearing has to be inferred. A
    // transcript that is not even in the target script, or that matched
    // nothing at all, is far more often a bad capture than a learner who has
    // genuinely lost the phrase. Waving the first one through costs a retry;
    // recording it costs a lapse on their schedule for something they may
    // well have said correctly.
    const offScript = !looksLikeTargetScript(transcript, district.script);
    const probableMishear = scored.points < 40 && (offScript || scored.points === 0);
    if (probableMishear && !retryOffered.has(stepIndex)) {
      setRetryOffered((prev) => new Set(prev).add(stepIndex));
      setMisheard(true);
      playSfx("error");
      posthog.capture("attempt_retry_offered", {
        task_id: target.id,
        step_index: stepIndex,
        points: scored.points,
        off_script: offScript,
      });
      return;
    }
    setMisheard(false);

    setAttempt({ transcript, verdicts: scored.verdicts, points: scored.points });
    if (scored.points > 0) {
      setTotalPoints((p) => p + scored.points);
      setGradedCount((c) => c + 1);
      onPoints(scored.points);
    }
    posthog.capture("language_attempt_scored", {
      task_id: target.id,
      district_language: district.language,
      step_index: stepIndex,
      points: scored.points,
      word_count: scored.verdicts.length,
      green_words: scored.verdicts.filter((v) => v === "green").length,
    });
    // The same score drives the spaced-repetition schedule, so a line said
    // well comes back later and one fumbled comes back sooner. Best-effort:
    // the drill must not stall on a failed write, and signed-out play simply
    // records nothing.
    void saveReview({
      districtId: district.id,
      lang: district.language,
      attempts: [
        {
          phraseNative: step.prompt.native,
          points: scored.points,
          answerVisible: true,
        },
      ],
    });
    setPhase("result");
    // Three-band feedback so the player hears how they did, not just sees it.
    if (scored.points >= 72) playSfx("success");
    else if (scored.points >= 40) playSfx("partial");
    else playSfx("error");
  }

  const promptWords = step?.prompt?.roman.split(/\s+/) ?? [];
  const verdictColor: Record<WordVerdict, string> = {
    green: "word-green",
    yellow: "word-yellow",
    red: "word-red",
  };
  // Same green/yellow/red bands scoreAttempt uses per-word, applied to the
  // overall live accuracy so the meter's colour matches the words it sums up.
  const liveAccuracyVerdict = (accuracy: number): WordVerdict =>
    accuracy >= 0.72 ? "green" : accuracy >= 0.4 ? "yellow" : "red";

  const stepsGraded = steps.filter((s) => s.prompt).length;
  const avgAccuracy = gradedCount ? Math.round(totalPoints / gradedCount) : 0;

  const npcNative =
    phase === "recall" && recallLine ? recallLine : step?.npc.native ?? "";
  const npcRoman = phase === "recall" ? null : step?.npc.roman;
  const npcEn = phase === "recall" ? null : step?.npc.en;
  const npcGloss = npcEn ? gloss(npcEn, baseLang) : null;
  const promptGloss = step?.prompt?.en ? gloss(step.prompt.en, baseLang) : null;
  const objectiveBrief = gloss(target.brief, baseLang);
  const completionNoteGloss = gloss(target.completionNote, baseLang);
  const roleGloss = gloss(target.role, baseLang);
  const tierLabel =
    target.lessonTier != null
      ? ui(lessonTierUiKey(target.lessonTier), baseLang)
      : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showClose={false}
        className="fixed top-auto bottom-6 max-h-[min(85vh,42rem)] translate-y-0 gap-0 overflow-y-auto p-0 sm:max-w-2xl"
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b-2 border-border px-4 py-3 text-left">
          <div
            className="size-9 shrink-0 rounded-base border-2 border-border"
            style={{ background: `#${target.colour.toString(16).padStart(6, "0")}` }}
          />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg">{target.name}</DialogTitle>
            <DialogDescription>
              {roleGloss} · {ui("learning", baseLang)}{" "}
              <strong className="font-indic text-foreground">{district.native}</strong>
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex flex-nowrap items-center justify-end gap-1">
              {target.errandLevel != null && target.lessonTier != null && (
                <Badge variant="neutral" className="shrink-0 text-[0.625rem] uppercase tracking-wide">
                  {ui("level", baseLang)} {target.errandLevel}/4 · {tierLabel}
                </Badge>
              )}
              <Badge variant="neutral" className="shrink-0">
                {Math.min(stepIndex + 1, steps.length)} / {steps.length}
              </Badge>
            </div>
            <DialogClose className="rounded-base opacity-100 ring-offset-white focus:outline-hidden focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
              <X />
              <span className="sr-only">{ui("close", baseLang)}</span>
            </DialogClose>
          </div>
        </DialogHeader>

        <Alert className="rounded-none border-x-0 border-t-0 shadow-none">
          <AlertTitle className="text-xs uppercase tracking-widest">
            {ui("objective", baseLang)}
          </AlertTitle>
          <AlertDescription>{objectiveBrief}</AlertDescription>
        </Alert>

        {phase !== "finished" && phase !== "review" && step && (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Card className="gap-2 py-4">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-[0.625rem] uppercase tracking-widest text-foreground/70">
                  {target.name}
                  {phase === "recall" && (
                    <span className="ml-2 normal-case tracking-normal text-main">
                      {ui("remembersYou", baseLang)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-4">
                <p className="font-indic text-lg leading-snug" lang={district.language.slice(0, 2)}>
                  {npcNative}
                </p>
                {npcRoman && (
                  <p className="text-sm italic text-foreground/80">{npcRoman}</p>
                )}
                {npcGloss && <p className="text-xs text-foreground/70">{npcGloss}</p>}
                {npcSpeaking && (
                  <span className="text-xs text-main animate-pulse">{ui("speaking", baseLang)}</span>
                )}
              </CardContent>
            </Card>

            <Card className="gap-2 py-4 text-right sm:text-right">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-[0.625rem] uppercase tracking-widest text-foreground/70">
                  {ui("you", baseLang)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-4 max-sm:text-left">
                {phase === "recall" ? (
                  <p className="text-base italic text-foreground/80">…</p>
                ) : step.prompt ? (
                  <>
                    <p className="flex flex-wrap justify-end gap-1.5 text-lg max-sm:justify-start">
                      {promptWords.map((w, i) => {
                        // Committed verdict wins once the mic is released; until
                        // then the live partial paints the same words as the
                        // player speaks them.
                        const verdict = attempt?.verdicts[i] ?? live?.verdicts[i];
                        return (
                          <span
                            key={i}
                            className={verdict ? verdictColor[verdict] : "text-foreground/80"}
                          >
                            {w}
                          </span>
                        );
                      })}
                    </p>
                    <p className="text-xs text-foreground/70">{promptGloss}</p>
                  </>
                ) : (
                  <p className="text-base italic text-foreground/80">…</p>
                )}
                {attempt && (
                  <p className="text-xs italic text-foreground/70">
                    {ui("youSaid", baseLang)} “{attempt.transcript}”
                  </p>
                )}
                {heardNothing && (
                  <p className="text-xs text-chart-2">{ui("didntCatch", baseLang)}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {phase === "result" && attempt && step.prompt && (
          <div className="flex items-center justify-between gap-3 border-t-2 border-border px-4 py-3">
            <p className="min-w-0 text-sm text-foreground/80">
              <strong className="text-xl text-main">+{attempt.points} pts</strong>
              {attempt.points === 0 && (
                <span className="ml-2 text-foreground/70">{ui("sayAgainReady", baseLang)}</span>
              )}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {attempt.points < 100 && (
                <Button
                  type="button"
                  variant="neutral"
                  size="icon"
                  sound="tap"
                  onClick={playPromptPronunciation}
                  disabled={ttsPlaying}
                  aria-label={
                    ttsPlaying
                      ? ui("playingPronunciation", baseLang)
                      : ui("hearPronunciation", baseLang)
                  }
                >
                  <Volume2 className="size-4" aria-hidden />
                </Button>
              )}
              {attempt.points === 0 ? (
                <Button type="button" onClick={retryLine}>
                  {ui("tryAgain", baseLang)}
                </Button>
              ) : (
                <Button type="button" onClick={advance}>
                  {ui("continue", baseLang)}
                </Button>
              )}
            </div>
          </div>
        )}

        {phase === "review" && reviewItem && (
          <div className="flex flex-col gap-3 border-t-2 border-border px-4 py-4">
            <div>
              <p className="text-xs font-heading uppercase tracking-wide text-foreground/55">
                From memory · {reviewIndex + 1} of {reviewQueue.length}
              </p>
              <h3 className="mt-1 font-heading text-base">
                You learned this from {target.name}. How would you say it?
              </h3>
              <p className="mt-2 text-lg leading-snug">&ldquo;{reviewItem.en}&rdquo;</p>
            </div>

            {(reviewRevealed || reviewResult) && (
              <div className="rounded-base border-2 border-border bg-secondary-background px-3 py-2">
                <p className="font-medium">
                  {reviewItem.roman.split(/\s+/).map((w, i) => (
                    <span
                      key={i}
                      className={reviewResult ? verdictColor[reviewResult.verdicts[i] ?? "red"] : undefined}
                    >
                      {w}{" "}
                    </span>
                  ))}
                </p>
                <p className="font-indic text-sm text-foreground/60" lang={district.language}>
                  {reviewItem.native}
                </p>
              </div>
            )}

            {misheard && (
              <p className="rounded-base border-2 border-border bg-main/20 px-2 py-1.5 text-center text-xs">
                That did not come through clearly. Say it once more, this one will
                not count against you.
              </p>
            )}
            {/* The drill shows this inside the NPC card, which is hidden here,
                so without its own copy an empty capture would fail silently. */}
            {heardNothing && !reviewResult && (
              <p className="text-center text-xs text-chart-2">{ui("didntCatch", baseLang)}</p>
            )}

            {!reviewResult ? (
              <div className="flex flex-col items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  className={cn(
                    "size-16 touch-none select-none text-2xl",
                    voice.recording && "bg-chart-2 hover:bg-chart-2",
                  )}
                  onMouseDown={() => {
                    playSfx("tap");
                    voice.start();
                  }}
                  onMouseUp={onMicUp}
                  onMouseLeave={onMicUp}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    playSfx("tap");
                    voice.start();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    void onMicUp();
                  }}
                  disabled={voice.transcribing}
                  aria-label="Hold to speak"
                >
                  {voice.transcribing ? "···" : voice.recording ? "◉" : "🎙"}
                </Button>
                {!reviewRevealed ? (
                  <Button type="button" variant="neutral" size="sm" onClick={() => setReviewRevealed(true)}>
                    Show me the line
                  </Button>
                ) : (
                  <p className="text-center text-xs text-foreground/55">
                    Line shown, so this attempt counts as practice rather than recall.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm font-medium">
                  {reviewResult.unaided
                    ? reviewResult.points >= 72
                      ? "Recalled without help."
                      : "Not there yet without the line. It will come back sooner."
                    : "Said with the line shown. Counted as practice."}
                </p>
                <p className="text-xs text-foreground/55">
                  Phrase match {reviewResult.points}%
                </p>
                <Button type="button" size="sm" className="w-full max-w-xs" onClick={nextReview}>
                  {reviewIndex + 1 < reviewQueue.length ? "Next" : `Talk to ${target.name}`}
                </Button>
              </div>
            )}
          </div>
        )}

        {phase === "errand" && (
          <div className="flex flex-col gap-3 border-t-2 border-border px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-sm">Now do it for real</h3>
                <p className="mt-0.5 text-xs text-foreground/65">{objectiveBrief}</p>
              </div>
              <div className="flex shrink-0 gap-1" aria-label="Errand checks">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    title={
                      ["Spoke the language", "Answered what was asked", "Got the outcome"][i]
                    }
                    className={cn(
                      "size-2.5 rounded-full border-2 border-border",
                      errandChecks[i] ? "bg-chart-2" : "bg-secondary-background",
                    )}
                  />
                ))}
              </div>
            </div>

            {errandTurns.length > 0 && (
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-base bg-secondary-background p-2">
                {errandTurns.map((t, i) => (
                  <p
                    key={i}
                    className={cn(
                      "text-sm",
                      t.who === "player" ? "text-foreground/60" : "font-indic",
                    )}
                    lang={t.who === "npc" ? district.language : undefined}
                  >
                    <span className="text-xs text-foreground/40">
                      {t.who === "player" ? "You: " : `${target.name}: `}
                    </span>
                    {t.text}
                  </p>
                ))}
              </div>
            )}

            {errandHint && (
              <p className="rounded-base border-2 border-border bg-main/20 px-2 py-1.5 text-xs">
                {errandHint}
              </p>
            )}

            {errandUsed.length > 0 && (
              <p className="text-xs text-foreground/55">
                Used so far: {errandUsed.length} of your {stepsGraded} lines
              </p>
            )}

            <div className="flex flex-col items-center gap-1.5">
              <Button
                type="button"
                size="icon"
                className={cn(
                  "size-16 touch-none select-none text-2xl",
                  voice.recording && "bg-chart-2 hover:bg-chart-2",
                )}
                onMouseDown={() => {
                  playSfx("tap");
                  voice.start();
                }}
                onMouseUp={onMicUp}
                onMouseLeave={onMicUp}
                onTouchStart={(e) => {
                  e.preventDefault();
                  playSfx("tap");
                  voice.start();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  void onMicUp();
                }}
                disabled={voice.transcribing || errandBusy || ttsPlaying}
                aria-label="Hold to speak"
              >
                {errandBusy || voice.transcribing ? "···" : voice.recording ? "◉" : "🎙"}
              </Button>
              <p className="text-xs text-foreground/50">
                {errandBusy
                  ? `${target.name} is thinking…`
                  : "No script now. Say what you need."}
              </p>
            </div>

            {/* The outcome is the model's call, and models are not always
                persuadable. After a few honest attempts there has to be a way
                out that does not require faking success. */}
            {errandTurns.filter((t) => t.who === "player").length >= 5 && (
              <Button type="button" variant="neutral" size="sm" onClick={onClose}>
                Leave it for now
              </Button>
            )}
          </div>
        )}

        {phase === "finished" && (
          <div className="flex flex-col items-center gap-3 border-t-2 border-border px-4 py-6 text-center">
            <Badge className="size-10 justify-center text-lg">✓</Badge>
            <h3 className="text-xl font-heading">{completionNoteGloss}</h3>

            {/* What the learner did, stated only from what was observed in
                this encounter. No line here is an estimate or a compliment:
                each one traces to a counter or a grader verdict. */}
            <ul className="w-full max-w-xs space-y-1.5 text-left text-sm">
              {reviewStats.asked > 0 && (
                <li className="flex gap-2">
                  <span aria-hidden>{reviewStats.recalled === reviewStats.asked ? "✓" : "·"}</span>
                  <span>
                    Recalled {reviewStats.recalled} of {reviewStats.asked} due phrase
                    {reviewStats.asked === 1 ? "" : "s"} before seeing the line
                  </span>
                </li>
              )}
              <li className="flex gap-2">
                <span aria-hidden>{errandFallbackTurns === 0 ? "✓" : "·"}</span>
                <span>
                  {errandFallbackTurns === 0
                    ? "No English fallback detected"
                    : `English fallback detected on ${errandFallbackTurns} turn${errandFallbackTurns === 1 ? "" : "s"}`}
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden>{errandHintsSeen === 0 ? "✓" : "·"}</span>
                <span>
                  {errandHintsSeen === 0
                    ? "No hints shown"
                    : `${errandHintsSeen} hint${errandHintsSeen === 1 ? "" : "s"} shown by ${target.name}`}
                </span>
              </li>
              {errandUsed.length > 0 && (
                <li className="flex gap-2">
                  <span aria-hidden>✓</span>
                  <span>
                    {errandUsed.length} practised line{errandUsed.length === 1 ? "" : "s"} recognised
                    in the unscripted conversation
                  </span>
                </li>
              )}
              {retryOffered.size > 0 && (
                <li className="flex gap-2">
                  <span aria-hidden>·</span>
                  <span>
                    {retryOffered.size} retr{retryOffered.size === 1 ? "y" : "ies"} offered after a
                    possible recognition error
                  </span>
                </li>
              )}
            </ul>

            <p className="max-w-xs text-xs text-foreground/60">
              Drill: {gradedCount}/{stepsGraded} {ui("linesScored", baseLang)}{" "}
              <strong>{avgAccuracy}%</strong>. These lines come back on your daily
              round as they start to fade.
            </p>

            <p className="font-base text-chart-4">
              {/* Optional errands (the haircut) pay XP, not cash — showing
                  "+₹0" would read as a bug rather than a design choice. */}
              {target.reward > 0 ? `+₹${target.reward}` : `+${target.xpReward ?? 0} XP`}
            </p>
            <Button type="button" className="mt-2 w-full max-w-xs" onClick={onClose}>
              {ui("done", baseLang)}
            </Button>
          </div>
        )}

        {phase === "player" && (
          <div className="flex flex-col items-center gap-2 border-t-2 border-border px-4 py-4">
            {misheard && (
              <p className="rounded-base border-2 border-border bg-main/20 px-2 py-1.5 text-center text-xs">
                That did not come through clearly. Say it once more, this one
                will not count against you.
              </p>
            )}
            <Button
              type="button"
              size="icon"
              className={cn(
                "size-16 text-2xl touch-none select-none",
                voice.recording && "bg-chart-2 hover:bg-chart-2",
              )}
              onMouseDown={() => {
                playSfx("tap");
                voice.start();
              }}
              onMouseUp={onMicUp}
              onMouseLeave={onMicUp}
              onTouchStart={(e) => {
                e.preventDefault();
                playSfx("tap");
                voice.start();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                void onMicUp();
              }}
              disabled={voice.transcribing}
              aria-label={ui("holdToSpeak", baseLang)}
            >
              {voice.transcribing ? "···" : voice.recording ? "◉" : "🎙"}
            </Button>
            {voice.recording && live && (
              <p className="text-xs">
                <span className={verdictColor[liveAccuracyVerdict(live.accuracy)]}>
                  {live.points}%
                </span>
                <span className="text-foreground/70">
                  {" "}
                  · {live.verdicts.filter((v) => v === "green").length}/{live.verdicts.length}{" "}
                  {ui("words", baseLang)}
                </span>
              </p>
            )}
            <p className="text-xs text-foreground/70">
              {voice.transcribing ? (
                ui("transcribing", baseLang)
              ) : voice.recording ? (
                voice.partial ? (
                  <span className="italic">
                    {voice.partial}
                    <span className="animate-pulse">▍</span>
                  </span>
                ) : (
                  ui("listening", baseLang)
                )
              ) : (
                ui("holdToSpeakLine", baseLang)
              )}
            </p>
          </div>
        )}

        {voice.error && (
          <Alert variant="destructive" className="rounded-none border-x-0 border-b-0">
            <AlertDescription>{voice.error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
