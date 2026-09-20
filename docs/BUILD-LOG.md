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

Skipped: Fly/Render and Cloudflare R2 not provisioned (not needed until later steps).

## Follow-up · Push, CI and Vercel wiring — 20 September 2026

Turned out the GitHub remote set up above pointed at the wrong repo: `matsudadubey/ProCircuit`
and `manudadubey/ProCircuit` are two different, unrelated GitHub accounts that each happen to own
a repo called `ProCircuit`. The one connected to Vercel is `manudadubey`. Remote was repointed to
`https://github.com/manudadubey/ProCircuit.git` and the local commit pushed there.

Push auth needed `gh auth login` (device flow, approved in the owner's already-signed-in browser
session) plus a scope refresh (`gh auth refresh -s workflow`) because GitHub blocked a push that
included `.github/workflows/ci.yml` without the `workflow` OAuth scope. Two personal access
tokens the owner pasted into chat during troubleshooting were never used (blocked by the
sandbox's own credential-leakage guard) and should be treated as compromised — flagged to the
owner to revoke both.

First CI run failed: pnpm 11.21.0 requires Node 22.13+, but the workflow pinned Node 20. Fixed by
bumping `.nvmrc`, `package.json` engines, and the workflow's `setup-node` version to 22. Second
run passed clean.

Vercel: created two projects via `create_git_project`, both linked to `manudadubey/ProCircuit` on
`main` — `procircuit` (root `apps/web`, Next.js) and `procircuit-admin` (root `apps/admin`,
Next.js). The linking API was flaky during setup (create calls reported success but the project
didn't persist, twice, before one finally stuck) — if wiring a third Vercel project later, expect
to possibly retry. Both projects deployed READY on the first real push and the Node-version-fix
push. A few empty, never-linked stray projects were left behind by the flaky attempts
(`procircuit-web` under `md-labs`, and an original bare `procircuit` under a different, now
403-ing team scope called "MD Labs projects") — harmless, safe to delete from the dashboard
whenever, not referenced by anything.

Questions raised: none that block build step 0.2.

## Step 0.2 · Database, migrations, row-level security — 20 September 2026

Acceptance checks restated before starting: (1) an integration test proves a player can read
only their own rows, (2) `fx_rates_daily` refuses updates and deletes at the database level, (3)
the migration applies cleanly on a fresh branch and is a no-op on a second run.

Built: the first ProCircuit migration (`packages/db/migrations/20260920090527_step_0_2_foundation.sql`),
covering exactly the tables step 0.2 names — `players`, `fx_rates_daily`, `agent_runs`,
`approvals`, `admin_actions`, `notifications`, `share_links` — plus an empty `pgboss` schema
(pg-boss will create its own job tables inside it once a worker exists, in a later step) and a
`console` database role with no grants (per TECH-ARCHITECTURE.md 2.4, grants come later). Every
player-scoped table has row-level security keyed on `auth.uid()`. `fx_rates_daily` is
insert-only, enforced by a trigger that rejects UPDATE and DELETE regardless of role, not just by
RLS. `agent_runs`, `approvals` and `admin_actions` — the two tables under the "2.3 The audit log"
heading plus the staff equivalent — are append-only: UPDATE and DELETE are revoked from every
role at the grant level, so even the service role can't rewrite them. `notifications` and
`share_links` use column-level GRANTs so a player's own session can flip `read` or renew/revoke a
share link but can't rewrite the rest of the row. A typed client was generated from the live
schema (Supabase MCP's `generate_typescript_types`) into `packages/db/src/database.types.ts` and
wired into `createAnonClient`/`createServiceRoleClient`.

Two follow-up migrations landed the same session: `20260920090637_step_0_2_fix_function_search_path`
fixes a WARN the security advisor raised immediately after the first migration (the trigger
function had a mutable search_path, a real privilege-escalation vector); `20260920091224_cleanup_rls_test_fx_rows`
removes two rows that had to be inserted into the live `fx_rates_daily` table to verify the
insert-only trigger (see below) — a no-op on any environment that never had them.

Decision: the user chose to apply directly to the main ProCircuit Supabase project rather than a
throwaway branch, after being asked (branching costs $0.01344/hour and there was no strong reason
to spend it for a schema that has no data yet). This is a one-time deviation from
`CLAUDE.md`'s "MCP writes go to branches only" default, made with explicit approval; nothing here
touched real player data since none exists yet.

Verified by hand against the live project (not just asserted): created two throwaway
`auth.users`/`players` rows, set `role authenticated` plus `request.jwt.claims` per PostgREST's
own mechanism inside a transaction, and confirmed player A's session sees only player A's row and
cannot insert an `approvals` row naming player B. Separately confirmed a `provisional` and an
`ecb` row for the same date/currency both survive, and that both UPDATE and DELETE against
`fx_rates_daily` raise the expected error. All test rows were removed afterwards (needed
temporarily disabling the delete trigger for the `fx_rates_daily` rows, since insert-only means
exactly that — done via a migration, not a raw statement, so it's part of the recorded history).
That same sequence is now written up as `packages/db/src/rls.integration.test.ts`, gated on
`SUPABASE_DB_URL` (a direct Postgres connection, needed to switch roles mid-session the way
PostgREST does) so it's skipped, not faked, in this sandbox and in CI, both of which lack the
database password.

Two documentation problems surfaced and had to be resolved rather than deferred:

- TECH-ARCHITECTURE.md section 2.1 says `fx_rates_daily` is unique on `(date, currency)` but also
  says a provisional rate and its later real rate are "both kept" — those two sentences can't both
  be true, and PRD-03 sides with "both kept" ("an unpublished ECB rate saves as provisional and is
  re-rated once, both rates audited"). Resolved by keying the primary key on
  `(date, currency, source)` instead, which satisfies "both kept" while still rejecting an
  accidental duplicate fetch of the same source/day/currency.
- TECH-ARCHITECTURE.md section 3 talks about the actions module checking for an "unconsumed"
  approval, but section 2.3's own field list for `approvals` has no such column. Step 0.2 is
  scoped to exactly that field list, so no column was added; flagging this for step 0.6 (the
  approval gate), which is where a payload-hash-and-consumption check will actually get built.

Skipped, deliberately: column-level restrictions on sensitive `players` fields (`verification`,
`tier`, `tier_status`, `deletion_*`) — a player can currently update their whole own row via RLS.
Tightening this belongs to the settings/billing steps that actually own those transitions, not to
this one. Also skipped: backfilling local migration files for the two migrations step 0.1 applied
directly against the project (`create_match_charting_tables`, `enable_rls_existing_tables`) —
they predate this session and are out of step 0.2's scope, but `packages/db/migrations/` and the
project's migration history are now out of sync for those two; worth a quick fix later.

## Step 0.3 · Auth: magic link and passkey — 20 September 2026

Acceptance checks restated before starting: (1) a new email can sign in from a link, (2) a
passkey can be registered and used, (3) there is no password column, field or route.

Built, in `apps/web`: `lib/supabase/client.ts` (browser client, passkey opted in via
`auth.experimental.passkey`), `lib/supabase/server.ts` (cookie-based server client for Server
Components/actions/route handlers), `lib/supabase/middleware.ts` + root `middleware.ts` (session
refresh on every request, following Supabase's own "don't add code between createServerClient and
getClaims()" warning literally), `app/signin/page.tsx` matching the prototype's `#/signin` copy
and structure exactly (logo line, email field, "Email me a sign-in link", an inline "Use a
passkey instead", "Create an account" back to `/onboarding`), `app/signin/actions.ts` (the magic
link server action, `signInWithOtp`), `app/auth/confirm/route.ts` (the server-side `verifyOtp`
callback the emailed link lands on), `app/auth/signout/route.ts`, and two small client components
(`passkey-sign-in.tsx`, `passkey-register.tsx`) since WebAuthn ceremonies only run in the
browser. `app/page.tsx` (still the step-0.1 placeholder otherwise) now gates on a session,
redirecting to `/signin` when there isn't one, and shows a "Register a passkey" / "Sign out" pair
when there is — the smallest surface that makes "a passkey can be registered and used"
demonstrable, since there's no Settings pane (PRD-12) to host that yet. Confirmed by grep: no
"password" field, column or route exists anywhere in `apps/web` or `packages/db`.

Verified: `pnpm -r typecheck`, `pnpm lint`, `pnpm format`, `pnpm -r test` all green; `next build`
for `apps/web` compiles and correctly marks `/`, `/signin`, `/auth/confirm` and `/auth/signout` as
dynamic, both with and without the Supabase env vars present (so a Vercel deploy won't hard-fail
before the env vars below are set — it'll just 500 at runtime on `/signin` until they are).

**Not verified, and can't be from here**: an actual magic-link email arriving, and an actual
WebAuthn ceremony (needs a real authenticator — a phone, a platform biometric, a security key).
Neither is something this sandbox can drive. The code follows Supabase's own documented
server-side-flow pattern closely (fetched live from their docs this session, not from training
data, since this area moves fast), but the end-to-end path needs a real run by a human before
calling it done.

**Genuinely blocked without the project owner** (at the time this was first written): Supabase
Auth's dashboard-level settings — Site URL, the redirect-URL allowlist, the Magic Link email
template, and the Passkey/WebAuthn Relying Party config — live in GoTrue's own config, not in
Postgres, so no tool available in this session (the Supabase MCP server's tool list, or SQL) can
read or write them; that needs either the dashboard or a Management API token this session didn't
have. The owner logged into the dashboard the same day, which unblocked items 1 and 3 below
immediately and item 2 once a Resend account existed (see the two follow-up sections below for
what was actually done and verified). What's left, before this works anywhere but
`http://localhost:3000`:

1. ~~**Auth > URL Configuration**~~ Done for local dev (Site URL defaulted to
   `http://localhost:3000` already; added `http://localhost:3000/**` to Redirect URLs). Redo for
   the Vercel `procircuit` URL and later the production domain when those exist.
2. ~~**Auth > Email Templates > Magic Link**~~ Done: repointed to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`, verified delivering
   through Resend with that exact link.
3. ~~**Auth > Passkeys**~~ Done for local dev only: enabled, RP ID `localhost`, origin
   `http://localhost:3000`. **Must be redone against the real domain before launch** — changing
   the RP ID invalidates every passkey registered under the old one, so whatever gets registered
   against `localhost` now (including the one used to verify this step) won't carry over. Also
   worth remembering: Supabase's passkey API is marked experimental ("the API may change without
   notice").
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the publishable
   key, not the service role key) as environment variables on the `procircuit` Vercel project —
   done locally in `apps/web/.env.local` (gitignored) for this session's testing, not yet done on
   Vercel itself.

Skipped, deliberately: the onboarding flow and the `players` row that would normally get created
after a first sign-in (PRD-11, a later step) — a first-time magic-link sign-in currently leaves
only the `auth.users` row Supabase itself manages, with no matching `players` row, since
`players` has several NOT NULL columns (tour, country, dob, home_currency, ...) that only
onboarding collects. Also skipped: any Settings/Account UI for managing existing passkeys (list,
rename, delete) — PRD-12 ST-2 wants that, but PRD-12's Settings pane doesn't exist yet; the
temporary "Register a passkey" button on the placeholder home page is scoped to proving the
mechanism, not to replacing that later screen. Also skipped: `apps/admin`'s mandatory-passkey
sign-in, explicitly deferred by the build plan to a later step.

### Follow-up · live testing against the real project, same day

The owner logged into the Supabase dashboard mid-session so this could be tested for real rather
than left as an untested plan. Configured, with the dashboard open in the browser: URL
Configuration (Site URL was already `http://localhost:3000` by default; added
`http://localhost:3000/**` to Redirect URLs), and Auth > Passkeys (enabled; Relying Party display
name "ProCircuit", RP ID `localhost`, origin `http://localhost:3000` — dev-only values, need
redoing against the real domain before launch, which will invalidate any passkeys registered
against `localhost`). The Magic Link email template could **not** be edited: Supabase's built-in
mailer only sends its fixed default templates, and "Set up custom SMTP to edit templates" gates
the editor entirely. That's a vendor decision (whose SMTP, e.g. Resend, already the planned
provider for patron email) that belongs to the project owner, not something to pick alone.

Ran the actual flow: started `apps/web` locally (`.claude/launch.json` added for this), submitted
the sign-in form with the owner's own email. Confirmed via `auth_logs` (Supabase's log stream,
queried through the MCP server, not guessed at): `POST /otp` succeeded, GoTrue sent the mail
(`mail.send`, `mail_type: confirmation`), and — 10 seconds later, with no human having clicked
anything — a `GET /verify` request completed the sign-in (`action: user_signedup`) from an IP
that doesn't belong to any device in this session, followed 17 seconds later by a second
`GET /verify` from a confirmed Google IP range (`74.125.19.44`) failing with "Email link is
invalid or has expired" (`One-time token not found`). auth.users confirms exactly one real user
(`manu.dadubey@gmail.com`) despite the dashboard's own Users table showing "10 users (estimated)"
— that estimate is stale Postgres statistics, not a real count; `select count(*)` gave 1.

That sequence is textbook link-scanner prefetching, not a bug in the request/response handling:
Supabase's own troubleshooting docs name this exact failure ("email scanners may scan and make a
GET request to the... sign-up link in your email... a user who opens an email post-scan to click
on a link will receive an error") and prescribe the fix — don't let the emailed link itself
perform the state change; land it on a page you control that requires an explicit click first.
`app/auth/confirm/route.ts` (an auto-verifying GET handler) was exactly the shape that's
vulnerable, so it's gone: replaced with `app/auth/confirm/page.tsx` (renders a "Sign in" button,
does nothing on mere GET) and `app/auth/confirm/actions.ts` (a server action, `confirmSignIn`,
that only runs `verifyOtp` when that button is actually submitted). A scanner hitting the page now
just renders inert HTML; nothing is consumed until a human clicks.

This fix is necessary but not sufficient on its own: the email going out right now still uses
Supabase's default template, which links straight to GoTrue's own `/verify` endpoint, not to
`/auth/confirm` — so the exact scanner race just demonstrated will keep happening until custom
SMTP is set up and the template is repointed (checklist item 2 above).

### Follow-up · custom SMTP wired up, full loop verified, same day

The owner created a Resend account and handed over access to finish the job. Generated a Resend
API key, configured it as ProCircuit's custom SMTP in Supabase (`smtp.resend.com:587`, sender
`onboarding@resend.dev` until a domain is verified — Resend's shared onboarding domain, which
exists for exactly this bootstrapping case), and rewrote the Magic Link template's source to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` (the Supabase dashboard's
template editor is a Monaco instance; keyboard-driven select-all/retype produced corrupted output
twice, so the edit was made through `window.monaco.editor.getEditors()[0].setValue(...)` instead,
which is exact and idempotent). Saving both flipped the project's email rate limit from
Supabase's built-in 2/hour to the custom-SMTP default of 30/hour, confirmed in `auth_logs`.

Ran the real flow end to end this time, no shortcuts: submitted the sign-in form from a running
`apps/web` instance, confirmed in Resend's own dashboard that the mail was generated from
ProCircuit's actual template and marked `Delivered`, then opened the exact link from that email
(`/auth/confirm?token_hash=pkce_...&type=magiclink`) and clicked "Sign in". Landed on `/`
correctly reading "Signed in as manu.dadubey@gmail.com." From there, "Register a passkey"
succeeded (`Registered passkey (Chromium Browser)`), proving `registerPasskey()` works once a
session exists. Signed out, returned to `/signin` cleanly.

One piece stayed unverified, for a reason worth recording rather than working around: clicking
"Use a passkey instead" (`signInWithPasskey()`, the discoverable-credential *sign-in* ceremony)
timed out with a WebAuthn privacy-considerations error. Passkey *registration* is a "create"
ceremony that this sandboxed browser could satisfy; *sign-in* is a "get" ceremony against an
existing credential, which needs an interactive OS-level picker the automation harness won't
complete on its own (by design — it's the same protection that stops a script from silently
approving a biometric prompt). This isn't a gap in the code: sign-in and registration go through
the identical `auth.experimental.passkey`-enabled browser client. It needs a human, in a real
browser, to confirm — everything server-side and everything registration-side is already proven.

Net result: magic-link sign-in is fully verified end to end against production infrastructure
(real SMTP, real template, real click-through, real session). Passkey registration is verified.
Passkey sign-in is implemented identically but needs a real device to finish confirming.
