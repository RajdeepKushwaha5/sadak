"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Development-only control for demonstrating retention in one sitting.
 * Rendered only when NODE_ENV is "development", and labelled as simulated
 * so nothing it produces can be mistaken for measured recall.
 */
function Panel() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function shift(days: number, streakDays?: number) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/dev/time-shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, streakDays, tzOffset: new Date().getTimezoneOffset() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setStatus(
        `Simulated ${data.shiftedDays} days passing for ${data.phrases} phrase(s)` +
          (data.streak ? `, with a ${data.streak}-day streak ending yesterday.` : ".") +
          " Reload to see it.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-8 rounded-base border-2 border-dashed border-border p-3 text-sm">
      <p className="mb-2 text-xs font-heading uppercase tracking-wide text-foreground/60">
        Development only · simulated time
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="neutral" disabled={busy} onClick={() => shift(3)}>
          Simulate 3 days
        </Button>
        <Button size="sm" variant="neutral" disabled={busy} onClick={() => shift(7)}>
          Simulate 7 days
        </Button>
        <Button size="sm" variant="neutral" disabled={busy} onClick={() => shift(7, 4)}>
          7 days + 4-day streak
        </Button>
      </div>
      {status && <p className="mt-2 text-xs text-foreground/70">{status}</p>}
    </div>
  );
}

/**
 * NODE_ENV is inlined at build time, so in production this is a constant
 * `return null` and the minifier drops Panel and every string in it. The
 * control is not just hidden in a deployed build, it is not there at all.
 */
export default function DevTimeShift() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Panel />;
}
