"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DistrictReport, Standing } from "@/lib/game/report";

const STANDING: Record<Standing, { label: string; blurb: string; className: string }> = {
  held: {
    label: "Held",
    blurb: "you could say this cold",
    className: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  },
  fading: {
    label: "Fading",
    blurb: "slipping, worth another round",
    className: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  },
  lost: {
    label: "Lost",
    blurb: "gone; needs re-teaching, not a reminder",
    className: "border-rose-500/50 text-rose-600 dark:text-rose-400",
  },
  new: { label: "New", blurb: "not yet tested", className: "border-border text-foreground/60" },
};

const ORDER: Standing[] = ["held", "fading", "lost", "new"];

export default function PhraseReport() {
  const [districts, setDistricts] = useState<DistrictReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/report")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json())?.error ?? "Could not load your progress.");
        return r.json();
      })
      .then((d) => !cancelled && setDistricts(d.districts ?? []))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-foreground/70">{error}</p>;
  if (districts === null) return <p className="text-sm text-foreground/70">Reading your phrasebook…</p>;

  if (districts.length === 0) {
    return (
      <p className="max-w-prose text-sm leading-relaxed text-foreground/70">
        Nothing recorded yet. Talk your way through an errand and the phrases you
        manage will start showing up here.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {districts.map((d) => (
        <section key={d.districtId} className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-heading tracking-tight">{d.name}</h2>
            <span className="text-sm text-foreground/60">
              {d.city} · {d.languageLabel}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {ORDER.filter((s) => d.counts[s] > 0).map((s) => (
              <Badge key={s} variant="neutral" className={cn("gap-1.5", STANDING[s].className)}>
                <span className="font-semibold">{d.counts[s]}</span>
                {STANDING[s].label}
              </Badge>
            ))}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phrase</TableHead>
                  <TableHead>Meaning</TableHead>
                  <TableHead>Standing</TableHead>
                  <TableHead className="whitespace-nowrap">Holds for</TableHead>
                  <TableHead>Learned from</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.phrases.map((p) => (
                  <TableRow key={p.native}>
                    <TableCell className="font-medium">
                      <span className="block">{p.roman}</span>
                      <span className="block text-xs text-foreground/50">{p.native}</span>
                    </TableCell>
                    <TableCell className="text-foreground/70">{p.en || "-"}</TableCell>
                    <TableCell>
                      <span className={cn("text-sm font-medium", STANDING[p.standing].className)}>
                        {STANDING[p.standing].label}
                      </span>
                      {p.lapses > 0 && (
                        <span className="block text-xs text-foreground/50">
                          missed {p.lapses}×
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-foreground/70">
                      {p.retainsDays === null ? "-" : `~${p.retainsDays}d`}
                    </TableCell>
                    <TableCell className="text-foreground/70">{p.teacher}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}
