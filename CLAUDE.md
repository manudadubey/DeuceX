# ProCircuit

Agentic SaaS for ATP and WTA players ranked roughly #150 to #1500. The agent proposes, the
player decides: nothing leaves the app (entry, payment, email, post, message) without a
player-authored row in `approvals`, and only `packages/actions` may import Stripe, Resend, the
entry client or ICS. Never work around this.

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

- Supabase project **ProCircuit** (`gpzpmrumwaqyfkyvqbgl`, org `MD Labs`, `ap-northeast-1`).
  Shares the database with an unrelated pre-existing schema (`matches`, `points`, `stats_*`); RLS
  is enabled on those tables. ProCircuit's own schema starts at build step 0.2 — see
  `packages/db/README.md`.
- GitHub: `matsudadubey/ProCircuit`.
- Vercel: not yet confirmed reachable from this session's connected account (only the "MD Labs
  projects" team is visible there, and it does not show a ProCircuit project).

## MCP servers to connect

- Supabase (migrations to a branch, logs, advisors), Vercel (deployments, build logs), Stripe
  (test mode only), Sentry, GitHub. Writes through MCP go to database branches and vendor test
  modes only, never production.
- Do not give any product agent MCP tools: agents take a pre-assembled input bundle and make one
  schema-constrained call (TECH-ARCHITECTURE.md section 3a).
- Phase 5 adds a ProCircuit admin MCP server over the console API with the console's roles,
  reasons and audit rows.

## Working rhythm

- One build-plan step per session. Restate the acceptance checks before writing code; run them
  before finishing.
- Append a short entry to `docs/BUILD-LOG.md` after each step: what was built, what was skipped,
  any question raised.
- Commit messages: `step X.Y: <what>`; branch per step.
