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

## Step 0.4 · Design system port (Baseline) — 20 September 2026

Acceptance checks restated before starting: (1) a kitchen-sink route renders every component
in both themes and matches Baseline visually, (2) a Playwright check confirms no horizontal
scroll at 390px.

Built `packages/ui`: the Baseline tokens (`src/styles/globals.css`) copied verbatim from
`docs/procircuit-baseline.html`'s `:root`, dark-media-query and `data-theme="dark"` blocks,
reorganised for Tailwind v4's CSS-first theming (`@theme inline` mapping `--color-*`/
`--radius-*`/`--font-*` onto the same runtime custom properties, the shadcn v4 idiom, since
Baseline predates v4 and the build plan's own "Tailwind theme mapping" sample is v3-style
JS config) — a theme flip still repaints every utility with no rebuild. The full component
set the step names: Button, Badge, Card (header/title/description/actions/content/footer),
PulseTile, Stat, Tabs (segmented), ToggleGroup, Switch, Input, InputGroup, Select, Textarea,
Field, Table, Item, Empty, Progress, Spinner, Toast, Tooltip, Sheet, Confirm, the Flag SVG
sprite (all 15 simplified flags plus the logo symbol, and `placeFlag()` for `pflag()`), and
the chart helpers `el()` (renamed `tagChartEnter` added alongside it for the enter-motion
tagging that was inline script in the prototype) and `axisK()` (now takes an explicit `rate`
parameter instead of reading a global `PREFS`/`RATES`, since packages/ui can't know about
app-level currency state). A `SampleRankChart` component demonstrates `el()`/`axisK()` with
the same 52-week ranking line as Baseline's own doc page. Motion, reduced-motion, reduced-
transparency and increased-contrast rules are global CSS in the same file; 44px mobile targets
use `max-[900px]:` (Baseline's own sidebar-collapse breakpoint, not Tailwind's default `sm`).

Decision: Radix UI primitives (`@radix-ui/react-*`), not Base UI — TECH-ARCHITECTURE.md
section 1 names either as acceptable ("Base UI or Radix"); Radix is the more mature and
documented option for the accessibility-bearing pieces (Tabs, Switch, ToggleGroup, Select,
Tooltip, Toast, Dialog-as-Sheet) and this is a one-way choice worth not re-litigating per
component. Styling is Tailwind utility classes plus `class-variance-authority` for variants,
`clsx`/`tailwind-merge` for a `cn()` helper, `lucide-react` for icons (per Baseline's own
"Lucide icons" preset note).

Wired `apps/web` only (not `apps/admin`, out of scope for this step): `transpilePackages:
['@procircuit/ui']` in `next.config.mjs`, `postcss.config.mjs` with `@tailwindcss/postcss`,
`app/globals.css` importing the package's token file directly (`@import
'@procircuit/ui/src/styles/globals.css'`), and `@source` directives inside that token file
(Tailwind v4 doesn't scan `node_modules` by default, and a pnpm workspace package is reached
through a symlinked `node_modules` entry) pointing at `packages/ui`'s own component/chart
directories and at `apps/web/app` and `apps/admin/app`, so utility classes used in either app
are generated. `app/layout.tsx` now loads the Geist/Geist Mono Google Fonts stylesheet and
mounts `<FlagSprite />` once. Built `app/kitchen-sink/page.tsx`, exercising every component
listed above in a single scrollable page with a light/dark theme toggle (same interaction as
Baseline's own doc page: flips `documentElement[data-theme]`, eases via the `.theming` class).

Also had to add `DOM`/`DOM.Iterable` to `tsconfig.base.json`'s `lib` array (was `["ES2022"]`
only, which happened to typecheck through step 0.3 because nothing yet referenced a bare DOM
global like `document` or `HTMLElement` directly — `next`'s own ambient types cover JSX and
`fetch`, but not, for example, the browser APIs the chart helper and theme toggle need).

Verified by hand, not just asserted: ran `apps/web` locally, screenshotted the kitchen sink in
both themes (light/dark toggle), opened both sheet variants (notification rail from the right,
quick actions from the bottom), confirmed the fresh-row table tint, meters, sparkline and the
sample chart's enter motion. Added `e2e/kitchen-sink.spec.ts` (390×844 viewport, both
`prefers-color-scheme`s) asserting `document.documentElement.scrollWidth <=
document.documentElement.clientWidth`; both pass. Added a `webServer` block to
`playwright.config.ts` and wired `pnpm test:e2e` into CI with placeholder
`NEXT_PUBLIC_SUPABASE_*` env vars, because apps/web's middleware (from step 0.3) refreshes the
Supabase session on every request, including `/kitchen-sink`, and 500s without them — confirmed
this by hand (renamed `.env.local` away, hit the route, got the exact error, restored it, added
placeholder values, confirmed 200) before wiring CI, rather than assuming. `next build` for
apps/web succeeds with `/kitchen-sink` prerendered as static.

Skipped, deliberately: `apps/admin` (no Tailwind/packages/ui wiring; it doesn't consume the
design system yet and step 0.4 doesn't ask for its shell, only the shell/routing step does); a
Storybook (the build plan offers "a Storybook or a single `/kitchen-sink` route" — chose the
route, since it needs no new tooling and the whole team already has to run `apps/web`); a
global toast-dispatch hook (`packages/ui` exports the Radix Toast primitives only; a `useToast`
helper is a product-level concern for whichever step first needs to fire one); per-component
Storybook-style prop docs beyond the source comments. `axisK()`'s home-currency conversion is
unexercised beyond the identity rate (1) since `fx_rates_daily` reads don't exist until an
agent needs them.

## Step 0.5 · App shell and routing — 20 September 2026

Acceptance checks restated before starting: (1) navigation works on desktop and phone, (2)
the collapsed sidebar widens the content, (3) the tab bar appears at 390px, (4) Lighthouse
accessibility is above 95 on the shell.

Built two route groups in `apps/web/app`: `(app)` (the full shell) and `(bare)` (onboarding,
sign-in, the coach view). `(app)/layout.tsx` gates every route it wraps on a session in one
place (`supabase.auth.getClaims()`, redirect to `/signin`) instead of each page repeating
step 0.3's check, then renders `components/shell/app-shell.tsx`: a 256px sidebar (48px
collapsed, `Cmd/Ctrl+B`, persisted to `pc.sidebar` per PROCIRCUIT-CONTEXT 4.5) built from
Baseline's own sidebar groups (Workspace, Agents, Account) minus the Sponsor and Fan agents,
which are Elite-only and don't exist yet; a sticky translucent topbar (title looked up from
the route, a date/week chip, share, tour, bell, theme); a `main` column whose max-width grows
from 1400px to 1600px when collapsed; a floating "Match Scribe" capture button under 900px
replaced by a five-tab bottom bar (Home, Tournaments, Scribe, Fans, Money), matching
`docs/procircuit-dashboard.html`'s actual markup exactly (900px, not the 1180px the context
doc's prose gives elsewhere — the build-plan step itself says 900px, and it's also what
`packages/ui`'s own mobile-target rule already uses, so there's no real conflict once the
prototype's CSS is checked directly). `components/shell/bare-shell.tsx` is the centred-column,
logo-then-content wrapper for the other group. The ten `(app)` routes and the `/onboarding`
and `/coach/[token]` `(bare)` routes are honest placeholders (an `Empty` block naming what
will eventually fill them, not fixture data); the dashboard (`/`) is the one exception, built
out as the real "three answers" empty state (PROCIRCUIT-CONTEXT 5.1) — an unverified-ranking
notice plus three `PulseTile`-styled links (Runway, Decision required, Patrons since last
login) that go to their eventual agent route and say why they're empty, rather than showing
placeholder numbers. `/signin` (moved from `app/signin` into `(bare)/signin`, logic
untouched) and its two existing client components were restyled onto Baseline's `Card`/
`Field`/`Button` instead of bare HTML, since they now sit inside the same bare shell as
everything else. The passkey-registration control step 0.3 left on the dashboard "because
there was nowhere else" moved to `/settings`, which now exists.

Share and the tour walkthrough are rendered `disabled` with a "Coming soon" title rather than
wired to fake behaviour — neither has a real implementation yet (no coach-share flow, no
walkthrough content). The bell opens a real `Sheet` with a genuine empty state ("No
notifications yet"): true, not a stub, since no agent writes notifications until Phase 1. The
FAB and mobile "Scribe" tab both lead to the real (placeholder) `/match-scribe` route; the
FAB's other two quick actions (scan a menu, scan a receipt) are disabled for the same reason
share/tour are. Extracted `ThemeToggle` (previously duplicated inline on the kitchen sink)
into `packages/ui` so the topbar and the kitchen sink share one implementation; behaviour is
unchanged from what step 0.4 already screenshotted and verified.

Verified by hand, not just asserted: ran `apps/web` locally end to end (real Supabase
credentials, not placeholders) and confirmed in the browser, not just in code — an
unauthenticated `/` redirects to `/signin`; `/signin`, `/onboarding` and `/coach/:token` render
the bare shell correctly in both themes at desktop and 375px with no console errors; the
kitchen sink's extracted `ThemeToggle` still flips both themes correctly. Added
`components/shell/use-sidebar-collapsed.test.tsx` and `sidebar.test.tsx` (new
`@testing-library/react`/`jsdom` setup for `apps/web`, since nothing rendered a React
component in a test here before) proving the collapse toggle, its `pc.sidebar` persistence,
the `Cmd`/`Ctrl+B` shortcut, and active-route `aria-current` highlighting. Added
`e2e/shell.spec.ts`: the unauthenticated redirect, no password field anywhere across the bare
routes (M-ID-1), no horizontal scroll at 390px for `/signin`/`/onboarding`/`/coach/:token` in
both themes, and an `@axe-core/playwright` scan of `/signin` — which found two real, fixable
issues (no `<main>` landmark, no top-level heading) before it passed clean, both fixed in
`bare-shell.tsx` and the sign-in page rather than suppressed.

**Not verified, and can't be from here**: Lighthouse itself. There's no Chrome DevTools
Lighthouse run available from this sandbox (same category of gap as step 0.3's WebAuthn
ceremony), and the authenticated app shell specifically — sidebar, topbar, tab bar as
rendered for a real signed-in player — couldn't be opened in a live browser either: doing
that needs a real Supabase session, and the only two ways to get one are a real magic-link
email click-through (needs a human) or weakening the `(app)/layout.tsx` auth check, which is
exactly the kind of shortcut this project's own approval-gate rule exists to prevent taking
casually, even temporarily and even reverted before commit. The authenticated shell's
interactive logic (collapse, persistence, keyboard shortcut, active-link state) is covered
instead by the component tests above, which don't need a session because they render the
components directly; a human should still open `/` after signing in for real and confirm it
against Lighthouse before this is called fully done.

Incidental fix: `playwright.config.ts` now takes its port from `PORT` (default 3000) instead
of hardcoding it, because this session collided with another Claude Code session's dev server
already bound to 3000 on the same machine — a plain, reusable fix, not scoped to this step.

Skipped, deliberately: the sidebar's user-menu popover (Public profile/Settings/Replay
setup/Sign out) that Baseline's chrome section describes — the sidebar footer already links
to Public profile and Settings and now has a working Sign out button, and a second copy of
the same three links behind a popover is not something this step's acceptance checks ask for;
notification content, the walkthrough, and the coach-share flow itself (PRD-04/PRD-12, not
built); `apps/admin`'s shell (out of scope, a later step).

## Step 0.6 · The approval gate and audit, before any agent exists — 21 September 2026

Acceptance checks restated before starting: (1) a test shows an action called without a valid
approval throws; (2) a test shows the lint rule fails a build that imports Stripe elsewhere;
(3) a duplicate enqueue is a no-op; (4) a paused agent's job is marked `skipped_paused`.

Migration (`packages/db/migrations/20260920134427_step_0_6_approval_gate.sql`) resolves the
question step 0.2 flagged and left open: TECH-ARCHITECTURE.md section 3 talks about verifying
an "unconsumed" approval, but `approvals` has no such column. Rather than add one, this adds a
separate append-only `approval_consumptions` table (`approval_id` as its primary key,
`player_id`, `agent_run_id`, `payload_hash`, `consumed_at`). `approvals` already has no UPDATE
grant for any role, deliberately, matching `agent_runs` and `admin_actions` (step 0.2); a
`consumed` column would need exactly that grant to ever get flipped, which would have punched
a hole in an invariant step 0.2 went out of its way to establish. The separate table's primary
key is also what makes "verify unconsumed, then consume" one atomic `INSERT` instead of a
check-then-act race between two concurrent callers — an `insert ... on conflict do nothing`-
shaped operation rather than a select followed by an update. Also added: `agent_schedules`
(`player_id`, `agent_name`, `paused`, `prompt_overrides jsonb`, primary key on the pair — a
missing row means not paused, no overrides) and `provider_switches` (append-only,
`provider`/`state`/`changed_by`/`reason`/`changed_at`, a provider with no row is implicitly
"on"). Both are named in TECH-ARCHITECTURE.md section 3 (`.paused`, `.prompt_overrides jsonb`)
and 2.4 (provider_switches' own field list) but neither had a full type spec anywhere, because
the admin kill switches (PRD-13 AD-15/16) and Elite's Agent Studio that would manage them
don't exist yet; both are defined here with exactly the fields already named, so the queue's
pickup check has something real to read, following the same "build the table before the
feature that populates it" precedent step 0.2 set for `agent_runs`/`approvals` themselves.

Supabase branching turned out to need the project's Pro plan, which this project isn't on, so
a branch couldn't be created to apply and verify the migration in isolation first. Asked the
owner how to proceed; decided to apply directly to the production project, the same one-time
exception step 0.2 made, on the same reasoning (three new, purely additive tables, no existing
data touched, nothing risky about the DDL itself). Verified with `get_advisors`: no new
security findings beyond the expected "RLS enabled, no policy" INFO note on
`provider_switches` (intentional — locked to the service role only until the admin console
exists). Regenerated `packages/db/src/database.types.ts` from the live schema afterwards, as
per the established pattern.

Built `packages/actions`: `gate.ts`'s `runGatedAction()` is the gate itself — loads the
approval (scoped to the calling player, so a wrong or foreign `approvalId` fails identically
to a missing one rather than leaking which is which), checks the action type and a
`hashApprovalPayload` (new, in `packages/shared`, a canonical-JSON SHA-256 so key order never
changes the hash) match, atomically claims it via the `approval_consumptions` insert, and only
then runs the caller's side-effect function — claiming before the side effect, not after, so a
vendor-call failure leaves the approval spent rather than risking a double vendor call if the
claim step were to fail after a successful one. `record-run.ts`'s `recordRun()` wraps a model
call, timing it and writing exactly one `agent_runs` row either way, mapping a thrown
`AgentValidationError` to `failed_validation` and anything else to `failed_infra`, with cost
looked up from `pricing.ts`'s small model-to-price table (illustrative starting figures, flagged
in its own comment to be checked against the vendor's current published rate, in the same
spirit as TECH-ARCHITECTURE.md section 5's own hedging about unverified numbers). Both `gate.ts`
and `record-run.ts` are built against a small hand-rolled DB interface (`ApprovalGateDb`,
`AgentRunsDb`) rather than requiring a live `SupabaseClient` directly, specifically so their
tests can inject an in-memory fake instead of needing a database connection — `gate.test.ts`
and `record-run.test.ts` are real, unskipped, and cover every branch (missing approval, wrong
player, wrong action type, payload mismatch, already consumed, success, and a second call
after a successful one) without touching Postgres at all. The real, Postgres-backed
implementations (`SupabaseApprovalGateDb`, `SupabaseAgentRunsDb`) exist and typecheck but are
unexercised beyond that — their correctness follows from the migration's own constraints.

The queue (`packages/actions/src/queue/`): `idempotency-key.ts` builds the
`agent_name:player_id:scheduled_window` string used as pg-boss's `singletonKey`;
`pickup-guard.ts`'s `evaluatePickup()` is the pure pause/provider-switch decision (both map to
the same `skipped_paused` outcome, per TECH-ARCHITECTURE.md section 3's own wording);
`retry-schedule.ts` gives the exact 5/20/60 minute backoff the build plan specifies, which
needed its own scheduling rather than pg-boss's built-in `retryBackoff` (exponential doubling
only, can't hit that exact sequence) — `queue.ts`'s worker catches a failure, computes the next
delay, and re-sends the job itself via `sendAfter` rather than relying on pg-boss's own retry
counter. All three of those pure pieces have real, unskipped tests. `queue.ts` itself
(`createBoss`, `enqueueAgentRun`, `registerAgentWorker`) is real, working pg-boss integration
code, added as a new dependency of `packages/actions`; `queue.integration.test.ts` proves the
duplicate-enqueue-is-a-no-op and paused-job-is-skipped acceptance checks directly against a
real pg-boss/Postgres instance, gated on `SUPABASE_DB_URL` exactly like
`packages/db/src/rls.integration.test.ts` already is, and skipped here and in CI for the same
reason: neither has the database password. No agent calls this queue yet (there are no agents
until Phase 1), so nothing here runs continuously anywhere.

The lint rule (`eslint.config.mjs`) already existed from the scaffold (step 0.1) and already
exempted `packages/actions`; added `ics` to the restricted list alongside `stripe` and
`resend` (CLAUDE.md names it as gated too) — "the entry client" is still unnamed since no
vendor or package has been chosen for it yet, flagged here rather than guessed at. Added
`lint-rule.test.ts`, which runs the real root ESLint flat config programmatically (via the
`eslint` Node API, `lintText` with a virtual `filePath`) against a fixture import of each of
the three module names, parametrized, both inside and outside `packages/actions` — a real,
executable proof of acceptance check 2, not just a manual `pnpm lint` run that could silently
stop proving anything if the config's `files:` scoping ever drifted.

The Confirm component (`packages/ui`, already built in step 0.4) needed no code changes — it
already takes an arbitrary `actions` slot. "Wired" here means the plumbing a future Confirm
usage is expected to call now exists and is tested: `createApproval()` (new, in
`packages/db`) inserts an `approvals` row through the *player's own* anon-scoped client, so
`approvals_insert_own`'s RLS policy is the real authorization, not the function; and
`confirmApproval()` (new, in `apps/web/lib/approvals`) is the browser-side wrapper a real
`Confirm`'s primary button will call. Deliberately did not wire this into the kitchen sink's
existing decorative Confirm demo (`docs/BUILD-LOG.md` step 0.4): kitchen sink is often run
locally against the real production Supabase project (as this session's own step 0.5 QA did),
and `approvals` is an append-only audit table — writing real demo rows into it every time
someone opens `/kitchen-sink` would pollute a genuinely audit-critical table for no product
reason. The mechanism is built and tested; the first real screen to use it is Phase 1's job.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` all green across every
package (74 tests passing, 7 skipped without a live database connection — 5 pre-existing RLS
integration tests plus the 2 new queue integration tests, all skipped for the identical,
documented reason); `pnpm --filter @procircuit/web build` still succeeds (no new routes; this
step has no UI surface of its own). `pnpm exec playwright test` still passes all 11 tests
(unaffected, as expected).

Skipped, deliberately: actually running a worker anywhere (no agent exists to schedule yet);
`admin_users`/the admin console's own grants on `provider_switches`/`agent_schedules` (PRD-13,
a later phase — the queue reads both via the service role, which doesn't need them); a
player-facing UI for `agent_schedules.paused` (Agent Studio, Elite, not built); wiring
`confirmApproval` into any real screen (no agent has a proposal to confirm yet). Question
raised and resolved with the owner: Supabase branching needs the Pro plan; owner chose to
apply the migration directly to production rather than upgrade or leave it unapplied.
