# ProCircuit

Agentic SaaS for ATP and WTA players ranked roughly #150 to #1500. The agent proposes, the
player decides: nothing leaves the app (entry, payment, email, post, message) without a
player-authored row in `approvals`, and only `packages/actions` may import Stripe, Resend, the
entry client or ICS. Never work around this.

## Status: Phase 0, Phase 1 and step 2.1 done, start step 2.2

The monorepo scaffold is built and deploying; the database has RLS-protected ProCircuit tables
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
gitignored `.env`, not in this repo. PRs #4 through #9 (steps 0.5, 0.6, 1.1, 1.2, 1.3, 1.4) are
merged to `main`. Step 1.4's live browser verification (guardian gate, ranking-lookup graceful
degrade, first-week dashboard) happened as a follow-up against a real signed-in session once a
dev-server slot freed up; see `docs/BUILD-LOG.md`'s step 1.4 entry for what it actually confirmed.
Step 2.1 (the FX archive and the ledger) added `ledger_lines`, `prize_receivables` and
`reserve_entries` (`fx_rates_daily` already existed from step 0.2), a new `receivable_received`
approval action type — the one transition TECH-ARCHITECTURE.md section 3 names as gated the same
as a Stripe/Resend/ICS call — and `packages/actions/src/receivables.ts`'s `markReceivableReceived`,
the first real caller of `runGatedAction` in this codebase. A real, key-less ECB daily-rate fetch
(`apps/api/src/fx`) and a Sunday reserve-balance reminder (`apps/api/src/reserves`) both run on a
new step-2.1-only pg-boss instance. Verified live against the real Supabase project (this project
still can't branch, so the migration went straight to production, owner-confirmed), including six
new RLS integration tests run against it, not just fixtures. See `docs/BUILD-LOG.md`'s step 2.1
entry for the full design reasoning, what it deliberately skipped (an actual gated UI for
balance updates or marking a receivable received — that's step 2.2's Financial Agent page), and a
pre-existing, unrelated step 1.1 test bug it found but left for a follow-up session (spawned as
its own task) rather than fixing here. Step 2.1 is [PR #10](https://github.com/manudadubey/ProCircuit/pull/10),
open against `main`, not yet merged. The next session should start at **step 2.2 (Financial
Agent)**, in `docs/BUILD-PLAN-CLAUDE-CODE.md`: read that step plus whatever architecture section
it names. Check `docs/BUILD-LOG.md` for what each prior step actually did (including follow-ups)
before assuming anything about the current state — this line is a pointer, not the full record.

## Read before coding

- `docs/BUILD-PLAN-CLAUDE-CODE.md` (the step you are on), `docs/TECH-ARCHITECTURE.md`, the PRD
  the step names, `docs/PRD-00-ProCircuit-Master.md` for cross-cutting rules.
- Design: `docs/procircuit-baseline.html` is the rule book; `docs/procircuit-dashboard*.html`,
  `docs/procircuit-admin.html` and `docs/procircuit-architecture.html` are the visual reference.
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

- **GitHub**: [manudadubey/ProCircuit](https://github.com/manudadubey/ProCircuit), `main` branch,
  public. Local git remote `origin` already points here. Push auth in a fresh shell needs
  `gh auth login` (device flow) — the account that owns this repo is `manudadubey`, not
  `matsudadubey` (a different, unrelated GitHub account that also happens to own a repo called
  `ProCircuit` — don't confuse them). `gh auth setup-git` wires git to use it once logged in.
- **CI**: `.github/workflows/ci.yml` runs install, typecheck, lint, format check and unit tests on
  every push/PR. Passing on `main`. Needs Node **22.13+** (pnpm 11 requires it) — this bit us on
  the first push, already fixed in the workflow, `.nvmrc` and `package.json` engines.
- **Vercel**: team `MD Labs` (slug `md-labs`, id `team_iBqss1JOLpPgFdy5bPzOyJeW` — note this is a
  *different* team from one also called "MD Labs projects" that a stale token scope may show
  instead; use `md-labs`). Two projects, both linked to the GitHub repo above and auto-deploying
  on push to `main`:
  - `procircuit` — the player app, root directory `apps/web`, framework Next.js.
  - `procircuit-admin` — the staff console, root directory `apps/admin`, framework Next.js.
  Both currently deploy the placeholder pages from step 0.1; both sit behind Vercel's default SSO
  protection (no custom domain yet). A few empty, unlinked stray projects (`procircuit-web` and an
  earlier bare `procircuit` under the other team) were left behind during setup and can be deleted
  from the dashboard whenever — harmless, no deployments, not referenced by anything.
- **Supabase** project **ProCircuit** (`gpzpmrumwaqyfkyvqbgl`, org `MD Labs`, `ap-northeast-1`).
  Shares the database with an unrelated pre-existing schema (`matches`, `points`, `stats_*`, from
  a different app); RLS was enabled on those 5 tables during setup (they had none before — a real
  anon-key exposure that's now closed) but they still have no policies, so only the service role
  can reach them. ProCircuit's own schema now exists (steps 0.2, 0.6, 1.1): `players`,
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

## MCP servers to connect

- Supabase (migrations to a branch, logs, advisors), Vercel (deployments, build logs), Stripe
  (test mode only), Sentry, GitHub. Writes through MCP go to database branches and vendor test
  modes only, never production — **except this specific Supabase project**, which can't branch
  (see the Supabase bullet above): confirm with the owner before every migration, then apply it
  directly, same as any other production write.
- Do not give any product agent MCP tools: agents take a pre-assembled input bundle and make one
  schema-constrained call (TECH-ARCHITECTURE.md section 3a).
- Phase 5 adds a ProCircuit admin MCP server over the console API with the console's roles,
  reasons and audit rows.

## Working rhythm

- One build-plan step per session. Restate the acceptance checks before writing code; run them
  before finishing.
- Append a short entry to `docs/BUILD-LOG.md` after each step: what was built, what was skipped,
  any question raised.
- Commit messages: `step X.Y: <what>`; branch per step. If the previous step's PR hasn't merged
  yet, branch off *that* branch (not `main`) and open the new PR with it as the base, rather than
  waiting — steps 0.5 and 0.6 are stacked this way ([#4](https://github.com/manudadubey/ProCircuit/pull/4),
  [#5](https://github.com/manudadubey/ProCircuit/pull/5)). Check open PRs at the start of a
  session (`gh pr list`) before assuming `main` has everything prior steps built.
