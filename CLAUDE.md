# DeuceX

**Renamed from ProCircuit on 25 September 2026** (owner decision; domain `deucex.ai`). Code, UI
copy, docs, the `@deucex/*` package scope, the GitHub repo (`manudadubey/DeuceX`) and both Vercel
projects (`deucex`, `deucex-admin`) all say DeuceX now. A few names deliberately still say
ProCircuit, each commented where it lives: the Stripe metadata keys `procircuit_player_id` and
`procircuit_tier_id` and the portal configuration tag `procircuit: 'fans'` (live Stripe objects
carry them), the offline-queue IndexedDB name `procircuit-match-scribe` (renaming it strands queued
notes), comments inside already-applied migrations (never edited), and the Supabase project and
Stripe sandbox account names, which are only renameable in those dashboards. Use DeuceX for
everything new.

Agentic SaaS for ATP and WTA players ranked roughly #150 to #1500. The agent proposes, the
player decides: nothing leaves the app (entry, payment, email, post, message) without a
player-authored row in `approvals`, and only `packages/actions` may import Stripe, Resend, the
entry client or ICS. Never work around this.

## Status: Phase 0, Phase 1, step 2.1 through step 4.1b done, start step 4.2

The monorepo scaffold is built and deploying; the database has RLS-protected DeuceX tables
(step 0.2); magic-link and passkey auth work end to end against production infrastructure (step
0.3); `packages/ui` has the full Baseline component set and a `/kitchen-sink` route in `apps/web`
(step 0.4); `apps/web` has the real app shell (sidebar, topbar, mobile tab bar, FAB, bare shell)
and the full step 0.5 route table (step 0.5); `packages/actions` has the approval gate
(`runGatedAction`, backed by a new append-only `approval_consumptions` table), `recordRun()`,
the pricing table, and the pg-boss queue with its idempotency key, pickup-time pause/provider-
switch check and 5/20/60 minute retry schedule, all with tests (step 0.6). Match Scribe's
`notes` and `check_ins` tables, the real `/match-scribe` route (recorder, review, history,
daily check-in), the offline queue, the Free-tier quota, and the audio lifecycle (immediate
delete on save, a 7-day sweep as backstop) are built behind adapters for R2 and Whisper (step
1.1), both configured and verified against real infrastructure. `packages/agents` has the first
agent, `match-scribe/extract` (step 1.2): one schema-validated OpenAI call (`gpt-4o-mini`, the
same OpenAI account and `OPENAI_API_KEY` as Whisper transcription, not a second vendor) with a
versioned Zod schema, one corrective retry on validation failure, and a mood-confidence floor,
wired into `apps/api` right after transcription so a saved note's result, opponent, tags, mood
and coach summary arrive pre-filled as proposals; a `failed_extraction` state and its own Retry
path (separate from transcription's, never re-uploading audio) cover the failure case. The
second agent, `mindset-coach` (step 1.3): a deterministic pattern detector over structured note
columns (no model in the detection loop), a distress evaluator (M-PRIV-3, opens a `cases` row),
and an orchestrator generating the daily insight via `gpt-4o-mini` with a schema-corrective
retry and a separate tone-check regenerate-once-then-withhold path — the first agent to actually
run on step 0.6's `AGENT_RUN_QUEUE`, with its own hourly scheduler. New tables `patterns`,
`insights`, `mindset_boundaries`, `cases`; the full `/agent/mindset` route and the dashboard
mood row. Also fixed a latent step 1.1 bug (`saveCheckIn`'s upsert touched ungranted columns,
failing every same-day re-save) found while live-testing this step's shared check-in card.
**Verified against the real OpenAI API**, not just mocks, both agent steps: step 1.2's Kovalenko
fixture transcript produced a correct, valid extraction on the first call for about $0.00025;
step 1.3's fixture notes correctly flagged the tiebreak/second-serve pattern and produced a
valid, tone-clean insight for about $0.0001. Step 1.4 (First-week dashboard and onboarding
without feeds) built the four-step onboarding wizard (guardian branch for under-18s per M-ID-3,
an ATP/WTA tour toggle, the ranking lookup behind a new `apps/api/src/rankings` adapter, the
ambiguous-match chooser and unverified badge per M-ID-2, stage detection and override) and the
first-week dashboard (`/` now branches on the new `players.dashboard_state`), plus a migration
giving `players` its first-ever INSERT policy — nothing before this step ever wrote a player's
own row. The ranking adapter's only production implementation always returns `unverified` (real
ATP/WTA/ITF feeds arrive with step 3.1); the `verified`/`ambiguous` paths are proven by a fixture
adapter in tests only. See `docs/BUILD-LOG.md`'s step 1.2 through 1.4 entries for detail,
including what each step deliberately skipped (step 1.3: the memory quote, the coach-link share
view, a per-player delivery-hour setting; step 1.4: the six-step spotlight walkthrough tour, the
public profile editor, real Stripe trial creation, the guardian-confirmation email itself, and
more). See `.env.example` for the vars; real credentials live only in the owner's local,
gitignored `.env`, not in this repo. PRs #4 through #11 (steps 0.5, 0.6, 1.1, 1.2, 1.3, 1.4, 2.1, 2.2)
are merged to `main` — no open or stacked branches. Step 1.4's live browser verification (guardian
gate, ranking-lookup graceful degrade, first-week dashboard) happened as a follow-up against a
real signed-in session once a dev-server slot freed up; see `docs/BUILD-LOG.md`'s step 1.4 entry
for what it actually confirmed.
Step 2.1 (the FX archive and the ledger) added `ledger_lines`, `prize_receivables` and
`reserve_entries` (`fx_rates_daily` already existed from step 0.2), a new `receivable_received`
approval action type — the one transition TECH-ARCHITECTURE.md section 3 names as gated the same
as a Stripe/Resend/ICS call — and `packages/actions/src/receivables.ts`'s `markReceivableReceived`,
the first real caller of `runGatedAction` in this codebase. A real, key-less ECB daily-rate fetch
(`apps/api/src/fx`) and a Sunday reserve-balance reminder (`apps/api/src/reserves`) both run on a
new step-2.1-only pg-boss instance. Verified live against the real Supabase project (this project
still can't branch, so the migration went straight to production, owner-confirmed), including six
new RLS integration tests run against it, not just fixtures. See `docs/BUILD-LOG.md`'s step 2.1
entry for the full design reasoning and what it deliberately skipped (an actual gated UI for
balance updates or marking a receivable received — that's step 2.2's Financial Agent page). A
pre-existing, unrelated step 1.1 bug in `rls.integration.test.ts` (the "notes" RLS block, a test
helper always rolling back so several tests asserted on state that never persisted) was found
while live-testing step 2.1 and fixed in a follow-up commit on the same
[PR #10](https://github.com/manudadubey/DeuceX/pull/10), which is merged.
Step 2.2 (Financial Agent) added the deterministic runway/burn/fourteen-week-projection engine,
budget vs actual, monthly P&L (decisions worksheet 7's pending-receivable fix made structural: the
P&L function has no parameter a pending receivable could even be passed through), and a ranked
"one thing to do this week" action, all in `packages/agents/src/financial`, plus a receipt-scanning
agent (a vision-model sibling of `match-scribe/extract`). Expense and balance writes stay plain
RLS-scoped CRUD (`insertLedgerLine`, `enterReserveBalance`, both already built in step 2.1) rather
than gated actions, since TECH-ARCHITECTURE section 3's hard actions-module list is exactly
Stripe/Resend/ICS/entry-client plus two named DB transitions and neither is on it; marking a prize
receivable received is on it, so it's this step's one real `runGatedAction` caller, wired end to
end for the first time (`apps/web`'s `confirmApproval`, prepared but unused since step 0.6, is now
called for real). New migration adds `budget_estimates` (a player's own named trip budgets,
standing in for a real tournament reference until step 3.1) and `financial_action_snoozes`; no new
column on `players` needed since `weekly_budget` already existed from step 1.4's onboarding wizard.
The new `/agent/financial` route and the dashboard's Runway tile compute their figures live and
directly from the ledger on every read (`apps/web/lib/financial/load.ts`) rather than caching them;
only the phrased "one thing" sentence is cached, keyed on the winning candidate's own hash, which
is what "live runs recompute figures without regenerating the action" actually means in code.
**Verified against the real Supabase project**, migration owner-confirmed before applying, and
against a real signed-in session in the browser (not deferred, unlike step 1.4): a balance update
and a manual expense entry both persisted and recomputed the KPI row, chart and budget bar
correctly; test rows deleted afterward. The build was also checked field by field against
`docs/deucex-dashboard-neumayer.html`'s own `#/agent/financial` prototype, which surfaced real
gaps (the milestone progress bar, the three runway summary tiles, CSV export, the ledger's
footer row) fixed the same session, not just noted. See `docs/BUILD-LOG.md`'s step 2.2 entry for
the full design reasoning, four bugs found and fixed (a with-pending chart line that was silently
never fed pending receivables, an unhandled promise rejection, a `pg-boss`-in-the-browser-bundle
break requiring a `@deucex/actions/queue` export split, and a shared dev server whose build
cache was corrupted by running a production build against it mid-session) and what it deliberately
skipped (scenario tabs pending step 3.2's Tournament Agent, the six-month P&L chart and month
selector, receipt rendition/redaction pending an image-processing dependency, patron MRR pending
step 4.1). [PR #11](https://github.com/manudadubey/DeuceX/pull/11) is merged.
Step 2.3 (Settings, preferences, sharing) built the nine Settings panes, closed step 0.2's own
flagged gap (a column-level grant lockdown on `players`, scoped to exactly the new
deletion/export columns, verified live to leave every existing write path, including onboarding's
replay flow, untouched), and finally closed the Sunday balance-reminder quiet-hours/per-player-
toggle follow-up both step 2.1 and step 2.2 flagged by name. It's the first step to make a real
Resend call (`packages/actions/src/resend-client.ts`, gated behind `requestAccountDeletion` and
`requestDataExport`, both wired through `runGatedAction` exactly like step 2.1's
`markReceivableReceived`) and the first to add a fully unauthenticated route
(`GET /sharing/:token`, apps/api's `sharing` module), since a coach or manager link visitor has no
Supabase session — RLS can't apply to that path at all, so the service role and a hand-built,
field-by-field DTO are what keep a coach link from ever seeing money and a manager link from ever
seeing notes. `/coach/[token]` (a step-0.5 stub since the beginning) and the account-deletion
confirm page (`apps/web/app/account/delete/confirm`, mirroring `auth/confirm`'s link-scanner-safe
GET-then-server-action shape) are both real now. Verified against the real Supabase project
(migration owner-confirmed before applying, same as every prior step) and against a real signed-in
session end to end: created and revoked a real coach and a real manager link, ran the full
account-deletion request → emailed-confirm → 14-day-scheduled → cancel cycle, and sent a real
export email — all three of which surfaced real bugs (an `Infinity`-over-JSON crash in the manager
view, an empty-CSV attachment Resend refused, an unverified sending domain, and a fourth `pg-boss`
instance that tipped the session pooler's connection cap over) fixed the same session, not just
noted; see `docs/BUILD-LOG.md`'s step 2.3 entry for all four and for what it deliberately skipped
(real Stripe Billing, Equipment pane content which is step 3.3's own job, most of Connections,
direct coach accounts). [PR #12](https://github.com/manudadubey/DeuceX/pull/12) is merged.
Step 3.1 (Rankings and calendars, with the manual path first) added `ranking_snapshots` (doubling
as both the per-player weekly history and the onboarding lookup's own matching directory,
`player_id` nullable — a real ambiguity in TECH-ARCHITECTURE.md's own schema description, resolved
this session rather than left for later), `tournaments`, and PRD-13's ops tables (`feed_status`,
`snapshot_imports`, `fact_corrections`, a minimal `alerts`); a CSV-backed feed adapter and import
service (`apps/api/src/rankings`) that matches rows to existing players, runs `detectStage` on
every refresh while respecting a pinned stage (M-STG-2), and reports a stage-change count (AD-18);
the real production `RankingLookupAdapter` (`directory-adapter.ts`, replacing step 1.4's
always-unverified stub) that verifies a new sign-up against that same directory; the dashboard's
doubles chip (M-STG-4) and a real stage-pin control on the still-otherwise-placeholder `/profile`
route (M-STG-2); and a genuinely new admin ingestion page in `apps/admin` (feed status with an
overdue badge, CSV import preview/apply, deadline entry, fact-sheet corrections) — the first real
page that app has had since its step-0.1 placeholder, and it ships with **no staff auth of its
own**, an explicit, owner-confirmed sequencing call (staff sign-in/roles/`admin_users` are step
5.1's job, two phases later than the build plan's own step numbering implies it needs to exist by
now) rather than either blocking the UI on that or bolting on a throwaway auth scheme. Also
deliberately not done, both flagged by name for a later step: the `players` column-grant lockdown
on `verification`/`tour_rank`/`tour_points`/`itf_rank`/`wtn` that step 2.3's own migration comment
called this step's job (needs `finishOnboarding`'s ranking writes moved server-side first, a real
refactor); and reconciling `ledger_lines.tournament_id` (currently `budget_estimates.id`) against
the real `tournaments` table (deferred again, now to step 3.2, since nothing creates a
tournament-linked ledger line until that step's Tournament Agent exists). **Verified against the
real Supabase project**, both migrations owner-confirmed before applying, including six new live
RLS integration tests, and a full live browser round trip through the actual `apps/admin` page
against production (not a curl): a real CSV import for the real "Jannik Sinner" fixture player
correctly diffed and applied, confirmed in the database across all four write paths (player cache,
snapshot row, feed status, import record). One item left for the owner: the test import changed
that player's live `tour_rank`/`stage`, and reverting it needed a raw SQL write this session's own
auto-mode classifier declined outside the confirmed-migration path — see `docs/BUILD-LOG.md`'s
step 3.1 entry for the exact statement to run if wanted. See that same entry for the full design
reasoning, two bugs found and fixed (a partial-unique-index `ON CONFLICT` limitation worked around
before it ever hit the live database, and four `FakeDb` test-support gaps), and everything else
deliberately skipped (a real licensed ATP/WTA/ITF feed, AD-20/AD-21's shortlist re-run since no
shortlist exists until step 3.2, a 52-week ranking chart, `apps/admin`'s real design system).
[PR #13](https://github.com/manudadubey/DeuceX/pull/13) is merged.
Step 3.2 (Tournament Agent) added `entry_decisions` and `shortlist_candidates` (both named,
unbuilt, in TECH-ARCHITECTURE.md's own architecture pass since the beginning), a second
`ledger_lines.real_tournament_id` column (the existing `tournament_id` stays pointed at
`budget_estimates.id`, unchanged, since repointing its semantics would break the Financial Agent's
existing readers), and three new player-set columns (`home_airport`, `coach_weekly_fee`,
`coach_travels`) the cost model needs. `packages/agents/src/tournament` is the whole shortlist
engine — cost model, acceptance status, round probabilities, filters, ranking, the calendar's
blocked-dates parser — and it is **fully deterministic, no model call**: the build plan's own step
3.2 bullet names no LLM step (every prior agent step's did), so the "why" paragraph is a
deterministic template and the LLM-authored why-text plus PRD-01's 300–500 word recommendation
memo are a named follow-up, not built this step. `packages/actions/src/entries.ts`'s
`confirmEntry`/`withdrawEntry` are this step's two `runGatedAction` callers (`action_type`
`entry_confirm`/`retract`, both reserved unused since step 0.2), following `receivables.ts`'s exact
shape including its central discipline: the planned amount always comes from the server's own
current `shortlist_candidates` row, never the approval payload. The scheduled run
(`apps/api/src/tournament`) registers on the shared `actionsBoss` (step 0.6's `AGENT_RUN_QUEUE`),
ticking hourly but firing only at the fixed Sunday 20:00 UTC instant PRD-01 asks for. `apps/web`
replaces the dashboard's static "Decision required" placeholder tile with a live one, adds the full
PRD-01 §4.2 decision card, and builds the real `/agent/tournament` page (shortlist, detail panel,
calendar tab) with a genuinely partial Free-tier lock (shortlist and why-text stay live; only cost,
outcome, the Net outcome rail and the entry controls dim, per decisions worksheet 14 — a different
shape from the Financial Agent's all-or-nothing page blur). **Verified against the real Supabase
project**, migration owner-confirmed before applying: six new live RLS integration tests (a player
can Skip/Undo directly but never set status to entered/withdrawn, insert a row, or touch
`shortlist_candidates` at all), then a full live round trip — six fixture "LIVE TEST" tournaments
inserted, the real scheduled-run function executed against production for the real "Jannik Sinner"
fixture player (five scanned and shortlisted, correctly ranked, one correct notification), the real
`confirmEntry`/`withdrawEntry` gated actions run end to end (a planned ledger line written and
removed, matching T-AC-4/T-AC-5), and a live signed-in browser pass over both `/agent/tournament`
and the dashboard, including flipping the fixture player to Free tier and back to confirm the
partial lock renders correctly — every fixture row and the tier flip cleaned up afterward via the
Supabase MCP's own `execute_sql`, confirmed empty by a follow-up count query. See
`docs/BUILD-LOG.md`'s step 3.2 entry for the full design reasoning, one bug found and fixed (a new
RLS test tried two forbidden statements in one aborted Postgres transaction, the same trap step
1.1's notes RLS block had already been found and fixed for once), a real inconsistency found in the
prototype's own mock shortlist order (it doesn't actually satisfy its own stated ranking rule) and
resolved by building the fixture from PRD-01's formal acceptance criteria instead, and everything
else deliberately skipped (Re-run now and the two event-triggered re-run causes; T-19's
ledger-learned cost priors and a real player surface/tier record for round probabilities, both
platform-prior-only for now; T-20/T-21's pin-and-consider; the coach-view agenda; a
`prize_receivables` writer, since no results ingestion exists yet; the players ranking-column
grant lockdown step 3.1 re-deferred, still not this step's job; a distance-aware flight price
model; the recommendation memo card).
[PR #14](https://github.com/manudadubey/DeuceX/pull/14) is merged.
Step 3.3 (Conditions and Equipment) added `equipment_profile` and `conditions_briefs` (named,
unbuilt, in TECH-ARCHITECTURE.md section 2.2 since the first architecture pass), the deterministic
rule engine in `packages/agents/src/conditions` (amber, ball-diff, the tension driver with an
explicit heat-then-altitude-then-humidity priority order, frames-to-bring, grip, unit conversion,
the stamp builder) verified against all five of the prototype's own fixture events, a batched prose
layer (up to five briefs per model call, one corrective retry, `gpt-4o-mini`) for the brief's own
comparison sentence, a real key-less Open-Meteo forecast adapter with a climate-normals fallback,
the Match note stamp attached at save time with a 24-hour backfill sweep, a daily refresh tick that
sends one FYI only when a recommendation actually flips (verified against CE-AC-14's exact
scenario), and the full UI: the Conditions brief inside the Tournament Agent detail, the dashboard
chip, stamp chips on Match Scribe notes, and the real Settings > Equipment pane. The stamp's real
shape settled a genuine inconsistency step 1.3 left open before PRD-08 existed (see
`docs/BUILD-LOG.md`'s step 3.3 entry for the full reasoning); mindset-coach's physical-pattern rule
still can't actually fire in production, now for a precisely named reason (no first-serve-percentage
extraction anywhere in this codebase's pipeline) rather than the old vaguer one. Verified against
the real Supabase project, migration owner-confirmed before applying, `database.types.ts`
regenerated and matched byte-for-byte against this step's own interim hand-written types; a live
signed-in browser session confirmed the Equipment pane's save, unit-toggle and CE-15/CE-AC-8 copy
exactly, and caught and fixed a real bug live (the unit toggle wrote to the database correctly but
didn't update Settings' shared in-memory state, so Preferences showed the stale unit until a
reload). Did not visually verify a live, fully populated Conditions brief in the browser this
session (tiles, racquet visual, two-frame test) — the shared dev environment this session ran in
(two concurrent sessions against the same repo and Supabase session pooler) made seeding a fixture
tournament a worse tradeoff than usual; the same logic is covered end to end by server-side
integration tests instead. See `docs/BUILD-LOG.md`'s step 3.3 entry for the full design reasoning
and everything else deliberately skipped (CE-21's post-event check-in, CE-22's order-of-play
forecast, a real climate-normals data source, a distinct day-before-travel refresh mechanism, the
players ranking-column grant lockdown deferred a third time now).
[PR #15](https://github.com/manudadubey/DeuceX/pull/15) is merged.
Step 4.1 (Fans) built the patron programme on Stripe Connect Express: a migration adding
`patron_programmes`, `patron_tiers`, `patrons`, `patron_events`, `payouts` (net = gross − fee −
Stripe as a check constraint, a paid row immutable by trigger), `patron_waitlist`,
`patron_note_drafts`, `patron_notes_sent` and a service-role-only `stripe_webhook_events`, plus the
`connect_onboard` and `waitlist_invite` action types; `packages/agents/src/fans` (all of PRD-04
section 7's arithmetic, deterministic, plus a small drafting call for patron notes);
`packages/actions/src/stripe-client.ts` (now the only file importing `stripe`, reached through the
`@deucex/actions/fans` subpath) and four gated actions in `fans.ts`; `apps/api/src/fans`
(webhook applier, checkout-return reconcile, public page, waitlist, 06:00 attention pass, on-tap
draft); and the real `/fans` page, the public `/p/<slug>` page, the dashboard Patrons tile and card,
patron income in the Financial Agent, and patron health on the manager link. Four owner decisions
made this session and recorded in `docs/BUILD-LOG.md`: direct charges, the player confirms each
waitlist invite, tier prices are grandfathered, and patron notes are drafted now by a Fans-owned
call. Verified with live RLS tests and a seeded, cleaned-up browser pass against production. The live Stripe
round trip then passed against the sandbox (a real test checkout recorded a patron in about 10
seconds). Connected accounts use **Accounts v2 with Stripe's Managed Risk and the Express
dashboard** (a Stripe preview, pinned API version); the sandbox's connected account, three tiers
and one test patron are left in place for step 4.2. `STRIPE_WEBHOOK_SECRET` is still unset, so no
real payout webhook has run yet. P-17 (the Stripe customer portal) and P-18 (pausing patron billing
on a downgrade to Free), launch blockers step 4.1 flagged, were closed in **step 4.1b**: an emailed,
HMAC-signed one-hour link to Stripe's portal for patrons, and gated `patron_billing_pause` /
`patron_billing_resume` actions that the downgrade confirm runs first, with the exact patron notice
shown beforehand; both verified live against the sandbox. A membership paused for 90 days now ends
automatically with a goodbye email (owner decision; `patrons.paused_at`, a sweep on the hourly Fans
tick). Still open: an in-app upgrade back to Pro. Also found and fixed
live: pg-boss's default 10-connection pool per instance tipped the session pooler's 15-client cap;
all three instances now set `max`. [PR #16](https://github.com/manudadubey/DeuceX/pull/16) is merged. [PR #17](https://github.com/manudadubey/DeuceX/pull/17) is merged. The next
session should
start at **step 4.2 (Content Agent)**, in `docs/BUILD-PLAN-CLAUDE-CODE.md`: read that step plus whatever
architecture section it names, and check `gh pr list` first — if a later PR hasn't merged yet,
branch off it rather than `main`, the same stacking step 0.5/0.6 used. Check
`docs/BUILD-LOG.md` for what each prior
step actually did (including follow-ups) before assuming anything about the current state — this
line is a pointer, not the full record.

**Open follow-ups before or alongside step 4.2** (none block starting it):
- Roll the Stripe sandbox secret key (pasted in chat).
- Set `STRIPE_WEBHOOK_SECRET` once `apps/api` has a public URL; no live webhook has run yet.
- De-duplicate the "Stripe needs something from you" notification (fired twice in one KYC pass).
- The payout footer's "1.75% + 30c" is only true for domestic charges (the Italian sandbox account
  paid about 6.5% with currency conversion): a PRD-04 copy fix.
- Em dashes left in step 2.3's Settings copy (billing pane), against the copy rule.
- Rename the Supabase project and the Stripe sandbox account to DeuceX in their dashboards
  (optional; nothing depends on those display names).

## Read before coding

- `docs/BUILD-PLAN-CLAUDE-CODE.md` (the step you are on), `docs/TECH-ARCHITECTURE.md`, the PRD
  the step names, `docs/PRD-00-DeuceX-Master.md` for cross-cutting rules.
- Design: `docs/deucex-baseline.html` is the rule book; `docs/deucex-dashboard*.html`,
  `docs/deucex-admin.html` and `docs/deucex-architecture.html` are the visual reference.
  Tokens only, both themes, 44px targets on mobile, sizes in rem.
- Decisions already made: `docs/DECISIONS-WORKSHEET.md` and `docs/PRD-REVIEW-REGISTER.md`. If a
  step needs a decision that is not there, stop and ask rather than choosing.

## Conventions

- TypeScript strict, pnpm, Vitest, Playwright. Every agent has a Zod schema and a fixture test.
  Every side effect has a test proving it fails without an approval.
- Money: original amount, currency and date only; home-currency figures are derived from
  `fx_rates_daily` at read time. Never store a converted amount. Receivables stay out of reserves
  until received (M-DATA-1, M-DATA-2).
- Copy: Australian English. Never use an em dash; use commas, colons, parentheses, en dashes or a
  new sentence. No model provider names in the interface. Every consequence sentence names amount
  or count, recipient, timing and reversibility.
- Migrations are forward-only and additive. RLS on every player table. The `console` role (admin
  console's database role) has an explicit grant list and no access to notes, audio, moods or
  photos.
- Reduced motion keeps opacity and colour fades; only movement stops. Reduced transparency makes
  chrome opaque. Contrast: more replaces hairline rings.

## Infrastructure already in place

- **GitHub**: [manudadubey/DeuceX](https://github.com/manudadubey/DeuceX), `main` branch,
  public. Local git remote `origin` already points here. Push auth in a fresh shell needs
  `gh auth login` (device flow) — the account that owns this repo is `manudadubey`, not
  `matsudadubey` (a different, unrelated GitHub account that owns a repo called
  `ProCircuit`, this repo's pre-rebrand name; don't confuse them). `gh auth setup-git` wires git to use it once logged in.
- **CI**: `.github/workflows/ci.yml` runs install, typecheck, lint, format check and unit tests on
  every push/PR. Passing on `main`. Needs Node **22.13+** (pnpm 11 requires it) — this bit us on
  the first push, already fixed in the workflow, `.nvmrc` and `package.json` engines.
- **Vercel**: team `MD Labs` (slug `md-labs`, id `team_iBqss1JOLpPgFdy5bPzOyJeW` — note this is a
  *different* team from one also called "MD Labs projects" that a stale token scope may show
  instead; use `md-labs`). Two projects, both linked to the GitHub repo above and auto-deploying
  on push to `main`:
  - `deucex` — the player app, root directory `apps/web`, framework Next.js.
  - `deucex-admin` — the staff console, root directory `apps/admin`, framework Next.js.
  Both currently deploy the placeholder pages from step 0.1; both sit behind Vercel's default SSO
  protection (no custom domain yet). A few empty, unlinked stray projects (`procircuit-web` and an
  earlier bare `procircuit` under the other team) were left behind during setup and can be deleted
  from the dashboard whenever — harmless, no deployments, not referenced by anything.
- **Supabase** project **ProCircuit** (the project is still named that; `gpzpmrumwaqyfkyvqbgl`, org `MD Labs`, `ap-northeast-1`).
  Shares the database with an unrelated pre-existing schema (`matches`, `points`, `stats_*`, from
  a different app); RLS was enabled on those 5 tables during setup (they had none before — a real
  anon-key exposure that's now closed) but they still have no policies, so only the service role
  can reach them. DeuceX's own schema now exists (steps 0.2, 0.6, 1.1): `players`,
  `fx_rates_daily`, `agent_runs`, `approvals`, `approval_consumptions`, `agent_schedules`,
  `provider_switches`, `admin_actions`, `notifications`, `share_links`, `notes`, `check_ins`, an
  empty `pgboss` schema, and a `console` role with no grants yet. See `packages/db/README.md` and
  `docs/BUILD-LOG.md` for how each table's design was resolved.
  **Not on the Pro plan**, discovered in step 0.6: `create_branch` fails with
  `PaymentRequiredException`. Until that changes, every migration this project runs has to go
  straight to production — ask the owner to confirm before applying one (steps 0.2, 0.6 and four
  migrations in step 1.1 all did; all were approved), rather than assuming the "branches only"
  default below still applies here.
  The database password was reset during step 1.1 to get a working `SUPABASE_DB_URL` (Supabase
  never shows it again after creation, so there was no way to recover the original) — owner
  approved. Direct connections need IPv6, which didn't resolve in that session's sandbox, so
  `SUPABASE_DB_URL` uses the **session pooler** host
  (`aws-0-ap-northeast-1.pooler.supabase.com:5432`, username `postgres.gpzpmrumwaqyfkyvqbgl`)
  instead of the direct `db.gpzpmrumwaqyfkyvqbgl.supabase.co` host; pg-boss needs a persistent
  session connection, so it's the transaction pooler (port 6543) that would be wrong here, not
  the session one. Switch to direct only if wherever `apps/api` actually runs has real IPv6.
- **Cloudflare R2** (step 1.1): account id `60982ed46c948e13ef23f9e1a11c5fbe`, bucket
  `audio-files`, for note audio (M-PRIV-1). Access key id and secret live only in the owner's
  local `.env`, never in this repo.
- **OpenAI** (step 1.1): a Whisper-capable API key, owner's own account, confirmed working
  (`whisper-1`) and with credits after an initial `insufficient_quota` failure during testing.
  Key lives only in the owner's local `.env`.
- **Resend** (step 2.3): a working API key, owner's own account; key only in the owner's local
  `.env`. Sending domain **`mail.deucex.ai`** (Resend domain id
  `26ac35a2-7651-460f-aeb7-bd7b21897401`, region `ap-northeast-1`) was added on 25 September 2026,
  with its DKIM, SPF (MX and TXT) and return-path CNAME records added to deucex.ai's DNS in Vercel
  and confirmed correct on Vercel's nameservers and public DNS. **Verified by Resend** the same
  day (about 20 minutes after the records went in), and a real patron manage-link email from
  `Jannik Sinner <updates@mail.deucex.ai>` was **delivered** to the owner's Gmail. The
  owner's local `.env` sets `RESEND_FROM_ADDRESS="DeuceX <updates@mail.deucex.ai>"` (quoted, so
  shell `. ./.env` works); without it `apps/api` falls back to Resend's sandbox sender
  (`onboarding@resend.dev`), which only delivers to the Resend account owner's own inbox and
  refuses `example.com` addresses. The old `deucex.ai` domain was never registered; don't
  use it.
- **Domain**: **`deucex.ai`**, bought 25 September 2026 through Vercel in the `md-labs` team
  (auto-renews, expires 2028), DNS on Vercel's nameservers. Only the Resend records above plus
  Vercel's defaults exist; it isn't attached to either Vercel project yet. Add DNS records one at a
  time in the dashboard: the Vercel connector's only DNS write replaces the whole zone file.
- **Stripe** (step 4.1): the **ProCircuit sandbox** account (its Stripe name predates the rebrand) (`acct_1UJAD5HFJcPzP6oW`, test mode
  only), key `STRIPE_SECRET_KEY` in the owner's local `.env` (it was pasted in chat on 24 September,
  so it should be rolled). Connect was enabled through the Stripe connector's sandbox-only
  `EnableConnect`. Connected accounts must be **Accounts v2** (v1 creation is refused for new
  platforms) with Stripe's Managed Risk and the Express dashboard, pinned to the preview API
  version in `packages/actions/src/stripe-client.ts`. Live sandbox state kept for step 4.2: the
  fixture player's connected account `acct_1UJBZpHFJctJN0Mp` (Italy, EUR settlement), three
  published tiers, and one test patron (Mira, active, Courtside). `STRIPE_WEBHOOK_SECRET` is not
  set, so no live webhook has ever run; the checkout-return reconcile covers new patrons.
  `PATRON_LINK_SECRET` (step 4.1b) must be set wherever `apps/api` is deployed.
- **Local dev URLs**: `APP_BASE_URL=http://localhost:3000` in the owner's `.env` (it had drifted to
  an old dev-server port, which sent Stripe's onboarding return to a dead page); keep it matching
  the web dev server's port.

## MCP servers to connect

- Supabase (migrations to a branch, logs, advisors), Vercel (deployments, build logs), Stripe
  (test mode only), Sentry, GitHub. Writes through MCP go to database branches and vendor test
  modes only, never production — **except this specific Supabase project**, which can't branch
  (see the Supabase bullet above): confirm with the owner before every migration, then apply it
  directly, same as any other production write.
- Do not give any product agent MCP tools: agents take a pre-assembled input bundle and make one
  schema-constrained call (TECH-ARCHITECTURE.md section 3a).
- Phase 5 adds a DeuceX admin MCP server over the console API with the console's roles,
  reasons and audit rows.

## Working rhythm

- One build-plan step per session. Restate the acceptance checks before writing code; run them
  before finishing.
- Append a short entry to `docs/BUILD-LOG.md` after each step: what was built, what was skipped,
  any question raised.
- Commit messages: `step X.Y: <what>`; branch per step. If the previous step's PR hasn't merged
  yet, branch off *that* branch (not `main`) and open the new PR with it as the base, rather than
  waiting — steps 0.5 and 0.6 are stacked this way ([#4](https://github.com/manudadubey/DeuceX/pull/4),
  [#5](https://github.com/manudadubey/DeuceX/pull/5)). Check open PRs at the start of a
  session (`gh pr list`) before assuming `main` has everything prior steps built.
