# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the SADAK language learning game and the Roznamcha field health worker app. PostHog is initialized client-side via a dedicated `PostHogInit` component (Next.js 15.1.x, pre-15.3 pattern) with a reverse proxy through `/ingest/*` to avoid ad blockers. A `posthog-node` singleton handles server-side captures in API route handlers, flushing immediately before the short-lived handlers return. User identity is wired to Supabase auth: `posthog.identify(userId)` fires on every auth state change, and `posthog.reset()` fires on `SIGNED_OUT`.

## Events instrumented

| Event name | Description | File |
|---|---|---|
| `sign_in_attempted` | User attempts to sign in via Google OAuth or magic link email. | `components/auth/LoginForm.tsx` |
| `signed_out` | User explicitly signs out of the app. | `components/auth/SignOutButton.tsx` |
| `district_entered` | Player selects a district and comfort level and enters the game world. | `components/Game.tsx` |
| `district_left` | Player leaves a district and returns to the title screen. | `components/Game.tsx` |
| `errand_started` | Player initiates a conversation with an NPC to begin an errand. | `components/Game.tsx` |
| `errand_completed` | Player successfully completes an errand and earns a cash reward. | `components/Game.tsx` |
| `language_attempt_scored` | Player's spoken language attempt is transcribed and scored in a dialogue lesson. | `components/Dialogue.tsx` |
| `voice_utterance_submitted` | Roznamcha health worker submits a spoken utterance for field record extraction. | `roznamcha/components/RoznamchaApp.tsx` |
| `roz_visit_filed` | Roznamcha health worker successfully files a completed household visit record. | `roznamcha/components/RoznamchaApp.tsx` |
| `errand_outcome_achieved` | ⚠️ **Never fires.** Captured in `app/api/errand/route.ts` and `app/api/task-talk/route.ts`, neither of which is called by the game. See "Routes that do not run" below. |
| `roz_visit_record_filed` | Server successfully files a Roznamcha household visit record to the store. | `app/api/roz/file/route.ts` |

## Files created or modified

- **Created** `components/PostHogInit.tsx` — client-side PostHog SDK initialization (module-level, no Provider needed)
- **Created** `lib/posthog-server.ts` — server-side `posthog-node` client factory
- **Modified** `app/layout.tsx` — added `<PostHogInit />` to root layout body
- **Modified** `next.config.mjs` — added `/ingest/*` reverse proxy rewrites for EU endpoints
- **Modified** `components/auth/AuthHeader.tsx` — added `posthog.identify` / `posthog.reset` on Supabase auth state changes
- **Modified** `components/auth/LoginForm.tsx` — `sign_in_attempted` capture for Google and magic link
- **Modified** `components/auth/SignOutButton.tsx` — `signed_out` capture before sign-out
- **Modified** `components/Game.tsx` — `district_entered`, `district_left`, `errand_started`, `errand_completed` captures
- **Modified** `components/Dialogue.tsx` — `language_attempt_scored` capture with points and word verdicts
- **Modified** `roznamcha/components/RoznamchaApp.tsx` — `voice_utterance_submitted` and `roz_visit_filed` captures
- **Modified** `app/api/errand/route.ts` — server-side `errand_outcome_achieved` capture (route is unused; see below)
- **Modified** `app/api/task-talk/route.ts` — server-side `errand_outcome_achieved` capture (route is unused; see below)
- **Modified** `app/api/roz/file/route.ts` — server-side `roz_visit_record_filed` capture

## Routes that do not run

`/api/talk`, `/api/task-talk` and `/api/errand` are LLM conversation routes
that nothing in the app calls. A repo-wide search finds no `fetch` to any of
them — the only hits are prose in comments and in this file. An earlier
version of this report described `task-talk` as the "primary game route",
which was wrong.

The conversation the game actually runs is:

| Step | Where |
| --- | --- |
| Speech to text | `/api/stt` (Sarvam saaras) |
| Grading the spoken line | `scoreAttempt` in `lib/game/speech-score.ts`, client-side, per word against the scripted `prompt.native` |
| Retention scheduling | `/api/phrase-review` -> FSRS -> `phrase_memory` |
| NPC free-form turn | `/api/recall` (Sarvam chat) |
| NPC speech | `/api/speak` (Sarvam bulbul) |

So `errand_outcome_achieved` has never been emitted, and any funnel built on
it reads zero. `language_attempt_scored` is the event that actually tracks
play.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard**: [Analytics basics (wizard)](https://eu.posthog.com/project/234346/dashboard/854917)
- **Player onboarding funnel**: [5Y5YqhMV](https://eu.posthog.com/project/234346/insights/5Y5YqhMV) — Conversion from sign-in → district entry → errand start → errand completion
- **Errand completions over time**: [4gtmPb25](https://eu.posthog.com/project/234346/insights/4gtmPb25) — Daily completions broken down by language
- **Language learning accuracy**: [G97XxZ7v](https://eu.posthog.com/project/234346/insights/G97XxZ7v) — Daily scored language attempts (learning activity)
- **District popularity**: [z4pSjlhB](https://eu.posthog.com/project/234346/insights/z4pSjlhB) — Which districts players enter most
- **Sign-in method breakdown**: [4mOW9ETJ](https://eu.posthog.com/project/234346/insights/4mOW9ETJ) — Google OAuth vs magic link usage

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — `AuthHeader.tsx` identifies on every `onAuthStateChange` event including `INITIAL_SESSION`, so returning sessions where Supabase restores the session should be covered, but verify this in the browser with PostHog debug mode (`?__posthog_debug=true`).

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
