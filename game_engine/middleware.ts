import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // `ingest` is the PostHog proxy (see next.config.mjs rewrites). Through
    // the auth check, signed-out visitors' events were redirected to /login
    // and every signed-in event cost a Supabase auth round trip.
    "/((?!_next/static|_next/image|favicon.ico|ingest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
