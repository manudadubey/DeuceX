# Build log

Append one entry per build-plan step: what was built, what was skipped, any question raised.

## Step 0.1 · Monorepo scaffold — 20 September 2026

Built: pnpm monorepo (`apps/web`, `apps/admin`, `apps/api`, `packages/ui`, `packages/db`,
`packages/agents`, `packages/actions`, `packages/shared`), TypeScript strict base config,
ESLint flat config with the Stripe/Resend `no-restricted-imports` rule scoped to
`packages/actions` only, Prettier, Vitest per package, a root Playwright config for e2e,
and a GitHub Actions workflow running install, typecheck, lint, format check and unit tests
on every push and pull request. Every package/app is a real, empty-but-working unit: `apps/api`
has a `/health` route with a passing test, `apps/web` and `apps/admin` are placeholder Next.js
apps, the rest are placeholder TypeScript packages with one smoke test each.

Also done outside the build plan's own step list, because it surfaced during setup: found the
existing Supabase project already named "ProCircuit" (`gpzpmrumwaqyfkyvqbgl`) had a critical
security gap (RLS disabled on all 5 of its existing tables, `matches`/`points`/`stats_*`, which
belong to an unrelated app). Owner decided to reuse that project rather than create a new one, so
RLS was enabled on those 5 tables (no policies yet — this only blocks anon/authenticated access,
not the service role). ProCircuit's own schema has not been added yet.

Skipped: no dependencies installed yet at the time of writing this entry (next). Fly/Render and
Cloudflare R2 not provisioned (not needed until later steps). Vercel project linking not done:
the connected Vercel account only has access to the "MD Labs projects" team, which does not show
a ProCircuit project; owner may have created it under a different scope. GitHub remote
(`matsudadubey/ProCircuit`) confirmed to exist but not yet wired as this repo's origin at the
time of writing.

Questions raised: none that block build step 0.2.
