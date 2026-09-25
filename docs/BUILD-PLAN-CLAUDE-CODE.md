# DeuceX build plan for Claude Code

Version 0.1 · 14 September 2026 · Owner: Manu Dubey · Companion to TECH-ARCHITECTURE.md v0.3, PRD-00 v0.4 to PRD-13, and Baseline (`deucex-baseline.html`)

This is the document to hand Claude Code, one step at a time. It turns the eighteen epics in TECH-ARCHITECTURE section 9 into an order that produces something a player can use early, keeps the approval gate structural from the first week, and never blocks on the ranking-data licences. Each step says what to build, what to read first, what "done" means, and the prompt to give Claude Code. Copy the `CLAUDE.md` at the end into the repository root before step 1.

---

## Can Mindset Coach be built first?

Yes, and it is the right first slice. Mindset Coach depends on Match Scribe (a voice note, a transcript, a structured extraction) and on nothing else: no ranking feed, no money model, no Stripe, no tournament calendar. Those two together are the smallest thing that is recognisably DeuceX: a player records a note after a match and the next morning reads one honest sentence about a pattern in her own words. It exercises the whole agent pipeline (queue, worker, schema-validated model call, proposal row, audit row, cost accounting) without touching anything irreversible, so the gate can be built and tested against a harmless agent before the Financial Agent or Fans ever see a credential.

What cannot come first: the Tournament Agent (needs feeds and the money model), Fans (needs Stripe Connect), Content Agent (needs Fans for recipients and Match Scribe for the trigger), Conditions (needs the Tournament Agent's shortlist). What can come very early alongside Mindset Coach: the Financial Agent's ledger and reserves, since they only need the FX archive.

So the order below is: foundation, then Match Scribe and Mindset Coach as the first usable slice, then money, then everything that needs feeds, with the admin console's ingestion path early so the product can soft-launch on hand-entered rankings.

---

## How to work with Claude Code on this

Give it one step per session. Start every session by pointing it at `CLAUDE.md` and the two or three documents the step names under "Read first"; do not paste the whole pack. Ask it to restate the acceptance checks before it writes code, and to run them before it says the step is done. Every step ends with the tests green, the migration applied on a database branch, and a short note appended to `docs/BUILD-LOG.md` saying what was built and what was left out. If a step needs a decision that the documents do not settle, Claude Code should stop and ask rather than choose; the decisions worksheet and the review register list what is already decided.

Keep the prototypes open in a browser while building. They are the visual reference (Baseline is the rule book), and the acceptance checks often say "matches the prototype at `#/route`".

---

## Phase 0 · Repository and foundation (E0, part of E12)

### Step 0.1 · Monorepo scaffold
Read first: TECH-ARCHITECTURE sections 1 and the repository layout in `deucex-architecture.html`.

Build: a pnpm monorepo with `apps/web` (Next.js, App Router, TypeScript), `apps/admin` (Next.js), `apps/api` (Fastify), `packages/ui`, `packages/db`, `packages/agents`, `packages/actions`, `packages/shared`, `infra`, `docs`. Copy the PRDs, TECH-ARCHITECTURE, the review register and this file into `docs/`. Set up ESLint, Prettier, TypeScript strict, Vitest, Playwright, and a GitHub Actions workflow that runs type-check, lint and tests on every push.

Done when: `pnpm install && pnpm -r typecheck && pnpm -r test` is green on an empty scaffold; the CI workflow runs on a pull request.

Prompt: "Scaffold the DeuceX monorepo exactly as `docs/TECH-ARCHITECTURE.md` section 1 and the repository layout describe. Empty packages are fine. Add the CI workflow. Do not add any feature code yet."

### Step 0.2 · Database, migrations, row-level security
Read first: TECH-ARCHITECTURE section 2 (all of it), PRD-00 section 5.3.

Build: Supabase project (local via the CLI), `packages/db` with the migration tooling, and the first migration containing only `players`, `fx_rates_daily`, `agent_runs`, `approvals`, `admin_actions`, `notifications`, `share_links`, and the pg-boss schema. Row-level security on every player-scoped table keyed on the authenticated player id. A separate `console` database role with no grants yet. A typed client generated from the schema.

Done when: an integration test proves a player can read only their own rows; `fx_rates_daily` refuses updates and deletes (insert-only trigger); the migration applies cleanly on a fresh branch and on a second run is a no-op.

Prompt: "Create the first migration from `docs/TECH-ARCHITECTURE.md` section 2.1 to 2.3 for the tables listed in step 0.2 only. Write RLS policies and a test that proves isolation. Make `fx_rates_daily` insert-only at the database level."

### Step 0.3 · Auth: magic link and passkey
Read first: PRD-00 M-ID-1, PRD-12 ST-21 and section 4.11, decisions worksheet 11.

Build: sign-in by emailed magic link with an optional passkey, no password anywhere. Session cookie for `apps/web`; the same mechanism with a mandatory passkey for `apps/admin` later. Sign-in page matching the prototype's `#/signin` (bare shell, logo, email field, "Email me a sign-in link", "Use a passkey instead").

Done when: a new email can sign in from a link; a passkey can be registered and used; there is no password column, field or route.

### Step 0.4 · Design system port (Baseline)
Read first: `deucex-baseline.html` (open it), DEUCEX-CONTEXT section 3.

Build: `packages/ui` with the tokens.css from Baseline's Implementation section, the Tailwind theme mapping, and the component set as React components on Base UI or Radix primitives: Button (primary, outline, secondary, ghost, destructive; sm and icon), Badge, Card (header, description, actions, footer), PulseTile, Stat, Tabs (segmented), ToggleGroup, Switch, Input, InputGroup, Select, Textarea, Field, Table, Item, Empty, Progress, Spinner, Toast, Tooltip, Sheet, Confirm, Flag (SVG sprite), and the chart helper `el()` with `axisK()`. Light and dark from tokens; reduced motion, reduced transparency and increased contrast rules; 44px targets on mobile; sizes in rem.

Done when: a Storybook or a single `/kitchen-sink` route renders every component in both themes and matches Baseline visually; the Playwright check confirms no horizontal scroll at 390px.

Prompt: "Port Baseline into `packages/ui`. Use the tokens.css block from `deucex-baseline.html` verbatim. Every component takes its colours from tokens only. Follow the motion and accessibility rules in Baseline's Motion and Accessibility sections. Build a kitchen-sink route that shows every component in both themes."

### Step 0.5 · App shell and routing
Read first: DEUCEX-CONTEXT sections 4.2 and 4.3, Baseline "Shells and routes".

Build: the `apps/web` shell: 256px sidebar with collapse (Cmd/Ctrl+B, persisted), sticky translucent topbar (title, date chip, share, tour, bell, theme), content column, mobile tab bar under 900px with the floating capture button, bare shell variant, route table matching the prototype (`/`, `/agent/tournament`, `/match-scribe`, `/agent/financial`, `/fans`, `/agent/content`, `/agent/mindset`, `/fuel`, `/onboarding`, `/profile`, `/settings`, `/coach/[token]`, `/signin`). Every route renders a placeholder page with the right title. The three-answers dashboard renders with empty states.

Done when: navigation works on desktop and phone; the collapsed sidebar widens the content; the tab bar appears at 390px; Lighthouse accessibility is above 95 on the shell.

### Step 0.6 · The approval gate and audit, before any agent exists (E12)
Read first: TECH-ARCHITECTURE section 3 (all), PRD-00 section 5.1, Baseline "The approval gate".

Build: `packages/actions` as the only package allowed to import the Stripe, Resend, ICS and entry clients, enforced by an ESLint `no-restricted-imports` rule in every other package and a CI check. Every exported function takes an `approvalId` first, loads the `approvals` row, verifies it is unconsumed and its payload hash matches, marks it consumed inside the same transaction as the side effect. A `recordRun()` helper that wraps every model call and writes `agent_runs` with tokens and cost from a pricing table. The pg-boss queue with the `(agent, player, window)` idempotency key, three retries with 5, 20 and 60 minute backoff, and the pause and provider-switch check at pickup. The `Confirm` component wired so a confirm always creates the `approvals` row before calling an action.

Done when: a test shows an action called without a valid approval throws; a test shows the lint rule fails a build that imports Stripe elsewhere; a duplicate enqueue is a no-op; a paused agent's job is marked `skipped_paused`.

Prompt: "Build the actions module and the run infrastructure from `docs/TECH-ARCHITECTURE.md` section 3. There are no agents yet; build the gate and prove it with tests and a lint rule. Nothing in this step may call a real vendor."

---

## Phase 1 · The first usable slice: Match Scribe and Mindset Coach (E3, E9)

### Step 1.1 · Notes and the recorder
Read first: PRD-02 (all), PRD-00 M-PRIV-1, M-LANG-2, decisions worksheet 3.

Build: the `notes` table and R2 bucket; the Match Scribe route matching the prototype: context group (Match, Practice, Travel, Other), 60-second recorder with waveform, review state (editable transcript, mood, result, opponent, tags, share-with-coach switch, conditions field), Save, Re-record, Discard; history with filters and search. Offline queue: a note recorded without signal is stored in IndexedDB and uploaded when connectivity returns, with a visible queue state. Whisper transcription behind an adapter with a mock. Audio lifecycle worker: delete on transcript confirmation or at seven days, write the cause on the row. Free-tier quota of ten notes a month.

Done when: a note recorded on a phone reaches R2, is transcribed (mock in tests, Whisper in staging), can be edited and saved; airplane mode then reconnect uploads the queue; the lifecycle job deletes audio at the right moment in a time-travelled test; the copy says "usually within twenty seconds" and "deleted after 7 days".

Prompt: "Build Match Scribe from `docs/PRD-02-Match-Scribe.md`. The transcription provider sits behind an interface with a mock. Include the offline queue and the audio lifecycle worker. Match the prototype at `#/match-scribe`."

### Step 1.2 · Structured extraction
Read first: PRD-02 sections 3 and 7, TECH-ARCHITECTURE section 3.

Build: the first agent in `packages/agents`: `match-scribe/extract` with a Zod schema (result, opponent, context, tags, mood proposal with confidence, summary for the coach view, conditions stamp) and a prompt; called through `recordRun()`; validation failure marked `failed_validation` with one corrective retry; the proposal written onto the note for the player to confirm in the review state.

Done when: a transcript fixture produces a valid extraction in tests with a recorded mock response; an invalid model response is retried once then fails cleanly with the note left in review; cost is recorded on the run.

### Step 1.3 · Mindset Coach
Read first: PRD-06 (all), PRD-00 M-PRIV-3, decisions worksheet 17, Baseline "Voice and copy".

Build: the daily insight (07:00 local, first language in Preferences, cached on the input hash so unchanged inputs do not regenerate), the mood check-in with the 30 and 90 day chart, patterns (three or more supporting notes within 90 days; Strong at a ratio of 0.6; evidence dots; Show the notes; Not a pattern with the no-repeat promise), the physical Conditions pattern from stamps, and the "someone to call" card triggered by the distress lexicon, which cannot be disabled and opens a case in the admin data model. The agent runs on the queue with the gate infrastructure from step 0.6. The dashboard mood row and the coach view's patterns section.

Done when: with five fixture notes the pattern "After a tiebreak loss, you write about rushing the second serve" appears with 3 of 4 evidence; a note matching the distress lexicon shows the card and writes a `cases` row; the insight is not regenerated when nothing changed; the copy never uses clinical language (a test greps the prompt output against a blocklist); the route matches the prototype at `#/agent/mindset`.

Prompt: "Build the Mindset Coach from `docs/PRD-06-Mindset-Coach.md`. It runs through the queue and `recordRun()`. The distress card is a hard rule with a test. Cache the insight on the input hash."

### Step 1.4 · First-week dashboard and onboarding without feeds
Read first: PRD-11 (all), PRD-00 sections 3 and 5.2, decisions worksheet 1 and 2.

Build: onboarding steps 1 to 4 with the guardian branch for under-18s (guardian email, manager link to the guardian by default, public profile off until confirmed), the tour toggle (ATP, WTA) and the ID fields, with the ranking lookup behind an adapter that returns "unverified" until step 3.1 exists; the ambiguous-match chooser and the unverified state with its badge; stage detection from a stored ranking; the first-week dashboard.

Done when: a 17-year-old cannot finish onboarding without a guardian email; an unverified player sees the badge and no public profile; the flow matches the prototype at `#/onboarding` and `#/first-week`.

At the end of Phase 1 a player can sign in, onboard unverified, record notes, and read a Mindset Coach insight. That is the first thing to put in front of a real player.

---

## Phase 2 · Money (E4, part of E11)

### Step 2.1 · The FX archive and the ledger
Read first: TECH-ARCHITECTURE section 2.1, PRD-03 sections 3, 6, 7, PRD-00 M-DATA-1, M-DATA-2, M-CUR-1.

Build: the ECB daily fetch into `fx_rates_daily` with provisional rows; `ledger_lines`, `prize_receivables` with `event` and `player_share`, `reserve_entries`; display conversion at read time from the archived rate; the M-DATA-1 acceptance example as an automated test (€38.50 on 10 September shown in AUD, then USD, original underneath). Reserves entered by the player with the Sunday reminder.

Done when: the M-DATA-1 test passes; a receivable marked received creates a realised reserve entry and not before; a currency preference change alters no stored row.

### Step 2.2 · Financial Agent
Read first: PRD-03 (all), decisions worksheet 5, 6, 7.

Build: runway, net burn, the fourteen-week projection per scenario (cash only, with pending prize), the monthly P&L excluding pending receivables, budget versus actual, receipt scanning behind an extraction adapter with batch queue and uncertain-field flags, the "one thing to do this week" action, the Financial route and the dashboard runway tile.

Done when: with the Arya fixtures the runway reads 8.3 weeks and September shows A$612 in with the Genoa cheque pending; a receipt fixture extracts merchant, amount, currency and locked rate; the route matches `#/agent/financial`.

### Step 2.3 · Settings, preferences, sharing
Read first: PRD-12 (all), decisions worksheet 4, 12, 13.

Build: the nine Settings panes; Preferences with three languages, three currencies, single patron-update language, units synced with Equipment; Notifications as two rows per agent (For you, FYI) with quiet hours; Sharing with coach and manager links, 128-bit tokens, expiry and Renew; the read-only coach view at `/coach/[token]` with no money; Data & safety with export, audio deletion, provider list and Delete account starting the 14-day cooling-off.

Done when: revoking a link makes the next request fail within a minute; the delete flow sets `deletion_effective_at` fourteen days out and a cancel clears it; the export job produces JSON, CSV and transcripts.

---

## Phase 3 · Feeds, tournaments, conditions (E2, E5, E6, E18 ingestion)

### Step 3.1 · Rankings and calendars, with the manual path first
Read first: TECH-ARCHITECTURE section 4 and the risk list, PRD-13 section 4.5 and AD-17 to AD-21, PRD-00 M-STG-1 to M-STG-4.

Build: `ranking_snapshots` with tour singles and doubles plus ITF; `tournaments` with tour; feed adapters for ATP, WTA and ITF behind one interface with a CSV import implementation first (the licensed feeds are added when signed); stage detection on every refresh; the admin ingestion page (feed status cards, ranking CSV import with preview and stage-change count, fact-sheet corrections, deadline entry). The onboarding lookup now verifies against the snapshot table.

Done when: importing the sample CSV updates 342 fixture players and reports stage changes; a WTA player's hero reads "WTA singles ranking"; the doubles chip shows when inside 500; a missed feed window raises an alert.

### Step 3.2 · Tournament Agent
Read first: PRD-01 (all), PRD-00 section 3, decisions worksheet 14.

Build: the weekly shortlist run (Sunday 20:00 UTC) scanning the tour-and-stage scope, cost model (flights from the player's home airport, accommodation, coach block, entry), cost-to-prize ratio with the A$60 per point placeholder as a named constant, outcomes by round, the detail panel, Accept entry as a confirm through the actions module creating a planned ledger line, Skip, Withdraw with Undo, the calendar tab, the dashboard decision card with its consequence sentence, and the Free-tier locked state (shortlist and brief live, cost and controls dimmed, one Start Pro trial action).

Done when: the Arya fixture produces the five-event shortlist in the prototype's order; Accept writes an approval and a planned expense; runway after R1 loss matches PRD-03's arithmetic; Free shows the locked state.

### Step 3.3 · Conditions and Equipment
Read first: PRD-08 (all), DEUCEX-CONTEXT 5.4.

Build: weather fetch per venue inside the travel window with climate-normal fallback; the brief (air amber at the forecast maximum of 28°C or 70 percent humidity, ball difference, frames to bring capped at frames carried, tension test proposal reading the equipment profile); the racquet visual; unit toggle with prose rewriting; note stamps; the physical pattern link; the Equipment pane.

Done when: the amber predicate evaluates the maximum of a range; the frames rule caps at the profile; the brief redraws in lb with "go up two pounds"; five briefs per run are batched into one model call.

---

## Phase 4 · Patrons and content (E7, E8, E10)

### Step 4.1 · Fans
Read first: PRD-04 (all), decisions worksheet 5, 6, PRD-00 M-TIER-3.

Build: Stripe Connect Express onboarding, tiers priced in the home currency, the public `/p/` page with a waitlist at the Pro cap, webhooks into `patrons`, the attention pass, drafted notes, `payouts` with the fee on gross and Stripe's charge separate, the payout table and MRR chart, the dashboard patrons tile.

Done when: a test checkout in Stripe test mode creates a patron within a minute; the 51st patron on Pro lands on the waitlist; a payout row shows gross A$612, fee A$49, Stripe A$14, net A$549.

### Step 4.2 · Content Agent
Read first: PRD-05 (all), decisions worksheet 8, 9.

Build: the draft within thirty minutes of a note, one language, voice profile from past updates, the four checks with the money rule as specified, the editor, recipients by tier, send time, teaser, the two-step publish on the agent page through the actions module to Resend, the one-tap dashboard card with the consequence sentence, Skip with a reason, history with opens.

Done when: a note fixture yields a 150 to 250 word draft that passes the checks; publishing writes an approval and sends through Resend's test mode; nothing sends without the approval row.

### Step 4.3 · Fuel
Read first: PRD-07 (all), decisions worksheet 15.

Build: menu photo capture and scan behind the extraction adapter, dietary hard rules, two or three picks with why and asks, logging a pick as a ledger line in the original currency at the locked rate, the "won't do" card, photo deletion after extraction, the Free-tier lock on the quick-actions sheet.

Done when: the sample menu produces three picks; logging writes a euro line at the day's rate; the photo object is gone after the run.

---

## Phase 5 · Operations and launch (E18, E1 finish, hardening)

### Step 5.0 · Admin MCP server (after 5.1)
Read first: TECH-ARCHITECTURE section 3a, PRD-13 AD-3 to AD-5.

Build: an MCP server in `apps/api` exposing read tools (player lookup, agent health, feed status, cases, spend) and the console's actions as tools that require staff identity, role and, for AD-5 actions, a reason; every call writes `admin_actions` with actor `mcp:<admin>`; side effects only through `packages/actions`.

Done when: a support identity cannot call an owner tool; a delete tool without a reason is refused; every call appears in the admin audit log.

### Step 5.1 · Admin console
Read first: PRD-13 (all), `deucex-admin.html`.

Build: `apps/admin` on its own hostname with staff auth (magic link plus mandatory passkey), the `console` database role with the explicit grant list (no grant on transcripts, audio references, moods, photo references), three roles that hide areas, Overview, Players with the confirm-and-reason actions, Agent health from the nightly aggregation, Money with reconciliation, Trust and safety cases, alerts and routing, the admin audit log merged into the player's Data & safety view.

Done when: a support login cannot reach Money by URL; a delete without a reason is refused; every admin action appears in the player's audit log marked as admin; the `console` role cannot select `notes.transcript` (a test asserts the permission error).

### Step 5.2 · Notifications, digest and the morning run
Read first: PRD-00 section 5.6, PRD-12 section 4.5.

Build: the notification rail with For you and FYI, push through Capacitor and Web Push, email through Resend with quiet hours and the deadline exception, the 07:00 UTC batch that runs every daily agent per player with the retry policy and the player-facing "This morning's run didn't complete" after the third failure.

### Step 5.3 · Mobile shells and stores
Build: Capacitor projects for iOS and Android with native push, background upload for the offline queue, camera and microphone permissions with the right copy, and store listings. Test the queue with the app backgrounded.

### Step 5.4 · Hardening and the cost pass
Read first: TECH-ARCHITECTURE sections 5, 6, 7, 8.

Build: model tiering per agent, caching on input hash where not already done, per-tier rate limits on on-demand runs, the 80 percent spend alert, the GDPR erasure job reaching sub-processors, backups with a restore drill, uptime check, Grafana dashboards from `agent_health_daily`, the approval-rate alert.

Done when: model spend per Pro player in staging with realistic fixtures is under A$7.35; a restore from snapshot succeeds on a branch; the erasure job produces a completion record.

---

## Release 2 (after real players)
E13 Elite forecast (TimesFM), E14 Sponsor Agent, E15 Fan Agent with review-before-sending, E16 Agent Studio, E17 digest, coach accounts and multi-language updates, doubles draws and partners. Each has a PRD; the same step format applies.

---

## CLAUDE.md to place in the repository root

```markdown
# DeuceX

Agentic SaaS for ATP and WTA players ranked roughly #150 to #1500. The agent proposes, the player decides: nothing leaves the app (entry, payment, email, post, message) without a player-authored row in `approvals`, and only `packages/actions` may import Stripe, Resend, the entry client or ICS. Never work around this.

## Read before coding
- `docs/BUILD-PLAN-CLAUDE-CODE.md` (the step you are on), `docs/TECH-ARCHITECTURE.md`, the PRD the step names, `docs/PRD-00-DeuceX-Master.md` for cross-cutting rules.
- Design: `docs/deucex-baseline.html` is the rule book; the prototypes in `docs/` are the visual reference. Tokens only, both themes, 44px targets on mobile, sizes in rem.
- Decisions already made: `docs/DECISIONS-WORKSHEET.md` and `docs/PRD-REVIEW-REGISTER.md`. If a step needs a decision that is not there, stop and ask.

## Conventions
- TypeScript strict, pnpm, Vitest, Playwright. Every agent has a Zod schema and a fixture test. Every side effect has a test proving it fails without an approval.
- Money: original amount, currency and date only; home-currency figures are derived from `fx_rates_daily` at read time. Never store a converted amount. Receivables stay out of reserves until received.
- Copy: Australian English. Never use an em dash; use commas, colons, parentheses, en dashes or a new sentence. No model provider names in the interface. Every consequence sentence names amount or count, recipient, timing and reversibility.
- Migrations are forward-only and additive. RLS on every player table. The `console` role has an explicit grant list and no access to notes, audio, moods or photos.
- Reduced motion keeps opacity and colour fades; only movement stops. Reduced transparency makes chrome opaque. Contrast: more replaces hairline rings.

## MCP servers to connect
- Supabase (migrations to a branch, logs, advisors), Vercel (deployments, build logs), Stripe (test mode only), Sentry, GitHub. Writes through MCP go to database branches and vendor test modes only, never production.
- Do not give any product agent MCP tools: agents take a pre-assembled input bundle and make one schema-constrained call (TECH-ARCHITECTURE section 3a).
- Phase 5 adds a DeuceX admin MCP server over the console API with the console's roles, reasons and audit rows.

## Working rhythm
- One build-plan step per session. Restate the acceptance checks before writing code; run them before finishing.
- Append a short entry to `docs/BUILD-LOG.md` after each step: what was built, what was skipped, any question raised.
- Commit messages: `step X.Y: <what>`; branch per step.
```
