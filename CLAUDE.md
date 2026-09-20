# ProCircuit

Agentic SaaS for ATP and WTA players ranked roughly #150 to #1500. The agent proposes, the
player decides: nothing leaves the app (entry, payment, email, post, message) without a
player-authored row in `approvals`, and only `packages/actions` may import Stripe, Resend, the
entry client or ICS. Never work around this.

## Status: Phase 0 done (step 0.6), start Phase 1 step 1.1

The monorepo scaffold is built and deploying; the database has RLS-protected ProCircuit tables
(step 0.2); magic-link and passkey auth work end to end against production infrastructure (step
0.3); `packages/ui` has the full Baseline component set and a `/kitchen-sink` route in `apps/web`
(step 0.4); `apps/web` has the real app shell (sidebar, topbar, mobile tab bar, FAB, bare shell)
and the full step 0.5 route table (step 0.5); `packages/actions` has the approval gate
(`runGatedAction`, backed by a new append-only `approval_consumptions` table), `recordRun()`,
the pricing table, and the pg-boss queue with its idempotency key, pickup-time pause/provider-
switch check and 5/20/60 minute retry schedule, all with tests (step 0.6). Still no agents and
no real vendor call anywhere. The next session should start at **step 1.1 (notes and the
recorder)**, the first step of **Phase 1: the first usable slice**, in
`docs/BUILD-PLAN-CLAUDE-CODE.md`: read that step plus whatever architecture section it names.
Check `docs/BUILD-LOG.md` for what each prior step actually did (including follow-ups) before
assuming anything about the current state — this line is a pointer, not the full record.

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
  can reach them. ProCircuit's own schema now exists (steps 0.2 and 0.6): `players`,
  `fx_rates_daily`, `agent_runs`, `approvals`, `approval_consumptions`, `agent_schedules`,
  `provider_switches`, `admin_actions`, `notifications`, `share_links`, an empty `pgboss` schema,
  and a `console` role with no grants yet. See `packages/db/README.md` and
  `docs/BUILD-LOG.md` for how each table's design was resolved.
  **Not on the Pro plan**, discovered in step 0.6: `create_branch` fails with
  `PaymentRequiredException`. Until that changes, every migration this project runs has to go
  straight to production — ask the owner to confirm before applying one (step 0.2 and step 0.6
  both did; both were approved), rather than assuming the "branches only" default below still
  applies here.

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
