import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  LeaderboardResponse,
  LeaderboardRow,
} from "@/lib/game/leaderboard";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 10;
const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const requestedPageSize = parsePositiveInt(
    url.searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(MIN_PAGE_SIZE, requestedPageSize),
  );
  const from = (page - 1) * pageSize;

  // The ranking lives in a private schema; get_leaderboard returns one page
  // plus the total, with `is_me` in place of user ids (migration 014).
  const { data, error } = await supabase.rpc("get_leaderboard", {
    p_limit: pageSize,
    p_offset: from,
  });

  if (error) {
    console.error("GET /api/leaderboard", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard." },
      { status: 502 },
    );
  }

  const result = (data ?? {}) as { total?: number; rows?: LeaderboardRow[] };
  const body: LeaderboardResponse = {
    rows: result.rows ?? [],
    total: result.total ?? 0,
    page,
    pageSize,
  };
  return NextResponse.json(body);
}
