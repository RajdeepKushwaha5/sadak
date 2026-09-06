"use client";

import { Flame, MapPin, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RoundStop = {
  taskId: string;
  name: string;
  role: string;
  districtId: string;
  districtName: string;
  phrases: { native: string; roman: string; en: string }[];
};

export type Round = {
  today: string;
  clearedToday: boolean;
  streak: { current: number; atRisk: boolean };
  longest: number;
  stops: RoundStop[];
  stopsAvailable: number;
};

/**
 * Today's walk.
 *
 * Shown once on entering a district with work due, then dismissed. A review
 * prompt that will not go away is a reason to stop opening the game.
 */
export default function DailyRound({
  round,
  cleared,
  onStart,
  onDismiss,
}: {
  round: Round;
  /** Task ids already practised in this session. */
  cleared: Set<string>;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const done = round.stops.filter((s) => cleared.has(s.taskId)).length;
  const total = round.stops.length;
  const allDone = total > 0 && done === total;
  const phraseCount = round.stops.reduce((n, s) => n + s.phrases.length, 0);

  return (
    <div className="pointer-events-auto w-full max-w-sm rounded-base border-2 border-border bg-background p-4 shadow-shadow">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base tracking-tight">
            {allDone ? "Round complete" : "Today's round"}
          </h2>
          <p className="mt-0.5 text-xs text-foreground/60">
            {allDone
              ? "Everything you owed today, said."
              : `${phraseCount} phrase${phraseCount === 1 ? "" : "s"} slipping, across ${total} stop${total === 1 ? "" : "s"}.`}
          </p>
        </div>
        {round.streak.current > 0 && (
          <Badge
            variant="neutral"
            className={cn(
              "shrink-0 gap-1",
              round.streak.atRisk
                ? "border-amber-500/50 text-amber-600 dark:text-amber-400"
                : "border-orange-500/50 text-orange-600 dark:text-orange-400",
            )}
            title={round.streak.atRisk ? "Clear today's round to keep it" : "Days practised in a row"}
          >
            <Flame className="size-3" strokeWidth={2} aria-hidden />
            {round.streak.current}
          </Badge>
        )}
      </div>

      <ol className="mb-4 space-y-1.5">
        {round.stops.map((stop) => {
          const isDone = cleared.has(stop.taskId);
          return (
            <li
              key={stop.taskId}
              className={cn(
                "flex items-start gap-2 rounded-base px-2 py-1.5 text-sm",
                isDone ? "text-foreground/45" : "bg-secondary-background",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {isDone ? (
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={3} aria-hidden />
                ) : (
                  <MapPin className="size-3.5 text-[#b06be8]" strokeWidth={2} aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className={cn("font-medium", isDone && "line-through")}>{stop.name}</span>
                <span className="text-foreground/55"> · {stop.role}</span>
                <span className="block truncate text-xs text-foreground/50">
                  {stop.phrases.map((p) => p.roman).join(" · ")}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onStart} className="flex-1">
          {allDone ? "Finish round" : done > 0 ? `Keep going (${done}/${total})` : "Start the round"}
        </Button>
        <Button size="sm" variant="neutral" onClick={onDismiss}>
          Later
        </Button>
      </div>

      {round.stopsAvailable > total && (
        <p className="mt-2 text-xs text-foreground/50">
          {round.stopsAvailable - total} more stop
          {round.stopsAvailable - total === 1 ? "" : "s"} waiting after this.
        </p>
      )}
    </div>
  );
}
