import type { LessonTier } from "@/lib/game/levels";
import type { StreetTask } from "@/lib/game/tasks";
import type { PhraseMemory } from "@/lib/game/phrase-memory";

/**
 * Where a phrase can be practised. A phrase is taught by whichever NPC's
 * lesson asks the player to say it, so a due phrase resolves to a spot on
 * the map rather than to a card in a deck.
 */
export type PhraseSite = {
  taskId: string;
  name: string;
  role: string;
  pos: [number, number];
  tier: LessonTier;
  roman: string;
  en: string;
};

export type DuePhrase = {
  native: string;
  roman: string;
  en: string;
  dueAt: string;
  lapses: number;
  state: number;
};

export type DueTask = {
  taskId: string;
  name: string;
  role: string;
  pos: [number, number];
  phrases: DuePhrase[];
};

const TIERS: LessonTier[] = ["easy", "medium", "hard"];

/**
 * Index every phrase a district's NPCs ask the player to produce.
 *
 * Only `prompt` lines count: `npc` lines are what the character says, which
 * the player hears but is never graded on. Keyed by native script to match
 * how phrase_memory identifies a phrase.
 */
export function indexPhraseSites(tasks: StreetTask[]): Map<string, PhraseSite> {
  const sites = new Map<string, PhraseSite>();

  for (const task of tasks) {
    for (const tier of TIERS) {
      for (const step of task.lessons?.[tier] ?? []) {
        const native = step.prompt.native.trim();
        if (!native || sites.has(native)) continue;
        sites.set(native, {
          taskId: task.id,
          name: task.name,
          role: task.role,
          pos: task.pos,
          tier,
          roman: step.prompt.roman,
          en: step.prompt.en,
        });
      }
    }
  }

  return sites;
}

/**
 * Group due phrases by the NPC who teaches them, most-lapsed first so the
 * round starts where recall is weakest.
 *
 * Phrases with no site left in the pack (a lesson was reworded since they
 * were learned) are returned separately rather than silently dropped — they
 * are still real gaps, they just have nowhere to send the player.
 */
export function groupDueByTask(
  due: PhraseMemory[],
  sites: Map<string, PhraseSite>,
): { tasks: DueTask[]; unplaced: string[] } {
  const byTask = new Map<string, DueTask>();
  const unplaced: string[] = [];

  for (const memory of due) {
    const site = sites.get(memory.phraseNative);
    if (!site) {
      unplaced.push(memory.phraseNative);
      continue;
    }

    let entry = byTask.get(site.taskId);
    if (!entry) {
      entry = {
        taskId: site.taskId,
        name: site.name,
        role: site.role,
        pos: site.pos,
        phrases: [],
      };
      byTask.set(site.taskId, entry);
    }

    entry.phrases.push({
      native: memory.phraseNative,
      roman: site.roman,
      en: site.en,
      dueAt: memory.dueAt!,
      lapses: memory.lapses,
      state: memory.state,
    });
  }

  const tasks = [...byTask.values()];
  for (const task of tasks) {
    task.phrases.sort((a, b) => b.lapses - a.lapses || a.dueAt.localeCompare(b.dueAt));
  }
  tasks.sort((a, b) => b.phrases.length - a.phrases.length);

  return { tasks, unplaced };
}
