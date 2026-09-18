import { NextResponse } from "next/server";
import { sarvamSTT, type LangCode } from "@/lib/sarvam";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Substrings in Sarvam STT 400 bodies that mean unreadable / bad audio. */
const STT_AUDIO_FORMAT_MARKERS = [
  "failed to read the file",
  "audio format",
] as const;

function sttStatus(err: unknown): number | undefined {
  return (err as { status?: number })?.status;
}

/**
 * A held-mic utterance is a few hundred KB of Opus. Anything far past that is
 * not speech the game asked for, and would be sent on to Sarvam on the
 * project's credits.
 */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  const audio = form.get("audio");
  const language = form.get("language");
  // Set by useVoice's live-partial requests (900ms MediaRecorder slices) so this
  // handler can skip the retry-with-backoff wrapper for them — see sarvamSTT.
  const partial = form.get("partial") === "true";

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "No audio supplied." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording too long. Hold the mic for one line." }, { status: 413 });
  }

  try {
    const transcript = await sarvamSTT(audio, {
      language: typeof language === "string" ? (language as LangCode) : undefined,
      mode: "transcribe",
      retry: !partial,
    });
    return NextResponse.json({ transcript });
  } catch (err) {
    const status = sttStatus(err);

    // Live partials are display-only. Mid-stream WebM often fails Sarvam's
    // decoder; the next slice (or the final send) is what matters. Soft-fail
    // so the server log stays quiet and the client keeps the last good partial.
    if (partial) {
      return NextResponse.json({ transcript: "" });
    }

    console.error("stt failed", err);

    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const formatError =
      status === 400 && STT_AUDIO_FORMAT_MARKERS.some((marker) => msg.includes(marker));

    return NextResponse.json(
      {
        error: formatError
          ? "Couldn't process that audio - hold the mic and try again."
          : err instanceof Error
            ? err.message
            : "Transcription failed.",
      },
      { status: 502 }
    );
  }
}
