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

## Step 1.1 · Notes and the recorder — 21 September 2026

Acceptance checks restated before starting: a note recorded on a phone reaches R2, is
transcribed (mock in tests, Whisper in staging), and can be edited and saved; airplane mode
then reconnect uploads the queue; a time-travelled test proves the lifecycle job deletes audio
at the right moment in a test; the copy says "usually within twenty seconds" and "deleted
after 7 days".

Migration (`packages/db/migrations/20260921090000_step_1_1_match_scribe.sql`, plus three
same-day follow-ups) adds `notes` and `check_ins`. Followed PRD-02 section 6's fuller data
dictionary rather than TECH-ARCHITECTURE.md 2.2's shorter indicative table, since PRD-02
section 3's own "Audit" paragraph requires transcription model/version, detected language and
confidence, extraction model/prompt/schema versions and validation result, and the player's
edits to each proposed field to be recorded on the note — TECH-ARCHITECTURE's table is missing
all of that. Structured-extraction columns (`result`, `opponent`, `tags`, `mood`, `summary`,
`extraction`, `edits`) are created now even though step 1.2 (not this step) is what populates
them as agent proposals, since PRD-02's review screen already lets the player set them by hand
before the extractor exists, and it is the same table either way — no second migration when
step 1.2 lands.

Deletion is never a SQL `DELETE` on `notes`. S-14's "Delete this note and its audio? Agents
lose it too" reads like a hard delete, but `audioDeleteCause`'s enum includes `playerDelete`,
which only means something if the row survives to carry it — the same append-only-state-
transition idiom `players.deletion_*` already uses. A note the player deletes after saving is
soft-deleted (content and `audio_ref` cleared, `status = 'deleted'`, cause `player_delete`);
every read path filters that status out, which is what "agents lose it too" actually requires.
A note that never reached `saved` (Discard, or walking away mid-review) is a real row + R2
object removal instead, in `apps/api/src/notes/service.ts`'s `discardNote()`, since S-16 is
explicit that discarded notes were never counted and nothing else depends on them.

Quota (S-16): no `note_quotas` counter table, which could drift from the notes it counts.
`notes_saved_this_month()` computes it directly from `notes`, scoped to the player's own
`players.timezone` so the month boundary matches their clock, not UTC. The advisor flagged two
real problems in the first pass, both fixed same-day in
`20260921091500_step_1_1_fix_notes_functions.sql` and
`20260921092500_step_1_1_revoke_default_function_grants.sql`: (1) the trigger function had a
mutable search_path, same class of bug as step 0.2's `reject_fx_rates_daily_mutation` fix; (2)
the quota function took the player id as a caller-supplied argument while running
`SECURITY DEFINER`, which bypasses RLS by design — any authenticated player could have passed
another player's id and read their count over `/rest/v1/rpc/notes_saved_this_month_for`. Split
into two functions instead: a zero-argument, `auth.uid()`-scoped one for a player's own
browser session, and a second, explicit-id version for apps/api's service-role client (which
has no `auth.uid()` of its own). The second migration wasn't enough on its own —
`revoke all ... from public` doesn't touch the separate per-role `EXECUTE` grants Supabase's
own `alter default privileges` already made to `anon`/`authenticated` at `CREATE FUNCTION`
time, confirmed by querying `information_schema.role_routine_grants` directly, which is why a
third migration exists revoking those grants explicitly. A fourth, small migration
(`20260921093000_step_1_1_notes_grant_no_status.sql`) removed `status`/`deleted_at` from the
player's own column grant on `notes`, added too generously in the first pass: Save has to
enforce the quota and the audio-confirmed deletion through apps/api, so a player's own session
being able to move `status` directly would have been a way around both.

The player/apps/api split follows TECH-ARCHITECTURE.md section 1's own line ("Next.js server
actions handle simple CRUD directly against the database; the Fastify service owns anything
with an external side effect or a scheduled job") applied literally: reading history, editing
a note's content fields while it's in review, and the quota display are direct client Supabase
calls through RLS (`packages/db/src/notes.ts`), the same "the player's own session is the real
authorization" pattern `confirmApproval` already established in step 0.6. Everything that
touches R2 or Whisper, or moves `status` — upload, save, discard, delete, retry — goes through
new `apps/api` routes (`apps/api/src/notes/routes.ts`) on the service-role client, which
authenticates the caller itself via `supabase.auth.getUser(token)` rather than trusting a
client-supplied player id (`apps/api/src/auth.ts`), since the service role bypasses RLS
entirely and would otherwise have no independent check at all.

Storage and transcription are both behind adapters (`apps/api/src/storage`,
`apps/api/src/transcription`), each with a real implementation (R2 via `@aws-sdk/client-s3`,
S3-compatible per TECH-ARCHITECTURE.md section 1; Whisper via a direct `fetch` to OpenAI's
`audio/transcriptions` endpoint, `whisper-1`, `verbose_json`) and a fake used in tests and as
`index.ts`'s own dev-only fallback when the real vendor's env vars aren't set, so
`pnpm dev:api` runs the whole pipeline end to end (upload → transcribe → review → save →
delete) without either vendor configured. **Neither vendor is actually wired up yet**: no R2
bucket exists and no `OPENAI_API_KEY` is set anywhere. `.env.example` documents the four `R2_*`
vars and `OPENAI_API_KEY`; the owner confirmed an OpenAI/Whisper account exists but the key
itself was deliberately not pasted into this session (kept out of the chat transcript) — both
need to land in a real `.env`/staging config before "real Whisper in staging" is actually true,
which is the one acceptance check this session could not itself close out.

Whisper's `verbose_json` response gives the detected language as a full name ("german"), not
the ISO 639-1 code PRD-02's own S-AC-3 expects ("de") — `whisper-adapter.ts` hand-maps the four
languages Preferences will actually offer (English, Chinese, Spanish, German) and falls back to
a lowercase two-letter guess for anything else, flagged in a comment rather than silently wrong.
It also has no per-note confidence field; `lang_conf` is estimated from the average
`no_speech_prob` across segments, a documented proxy, not a real confidence score — matching
PRD-02 section 12's own note that the mood-proposal confidence threshold is "a placeholder for
review with real transcripts."

The audio lifecycle (S-13, M-PRIV-1, decisions worksheet item 3 — seven days, not the
prototype's ninety) is two code paths sharing one idea, not one scheduled sweep for everything:
`saveNote()` in `apps/api/src/notes/service.ts` deletes the audio synchronously the moment a
note is saved (S-AC-7's "within one minute" falls out trivially from doing it inline), writing
cause `confirmed`; `audio-lifecycle.ts`'s `sweepExpiredAudio(deps, now)` is the seven-day
backstop for a note that never reaches `saved`, taking `now` as a parameter rather than reading
the clock itself so `audio-lifecycle.test.ts` can time-travel to exactly the S-AC-8 boundary
(uploaded 5 Sep 19:15, swept 12 Sep 19:15) without mocking global `Date` or waiting a week. In
production this runs on its own small pg-boss queue (`apps/api/src/notes/queue.ts`,
deliberately not reusing `packages/actions`'s `AGENT_RUN_QUEUE` — that queue's shape and its
pause/provider-switch pickup guard are built for scheduled *agent* runs, and Match Scribe
transcription is player-triggered, not scheduled or agent-schedule-gated), scheduled hourly via
`boss.schedule()`; nothing calls that scheduler in tests, only the pure function it wraps.

The offline queue (S-18, S-AC-12) is IndexedDB via `idb` (`apps/web/lib/match-scribe/offline-
queue.ts`), tested against `fake-indexeddb` since jsdom has no real IndexedDB implementation.
Drains oldest-first on mount and on the browser's `online` event, stopping at the first upload
failure rather than skipping past it (a failure almost always means "still offline", so the
rest stay queued for the next attempt in order). The 7-day audio clock starts at the real
upload, not at record time, which falls out for free: nothing reaches apps/api, so nothing sets
`audio_uploaded_at`, until the queue actually drains.

The recorder itself (`apps/web/components/match-scribe/`) uses `MediaRecorder` plus a Web Audio
`AnalyserNode` feeding the waveform canvas real microphone levels rather than the prototype's
synthetic random ones. The review screen exposes transcript, mood, result, opponent, tags and
the coach-share switch; round and surface exist as columns (PRD-02's data dictionary) but have
no dedicated input in this step, since the prototype only ever shows them folded into a single
opponent line and nothing yet parses them out separately (step 1.2's job). The Conditions field
only renders when `note.cond` is already present — PRD-08 (Conditions, step 3.3) is what
attaches a stamp, and doesn't exist yet, so S-11 is structurally ready (the column, the
conditional UI) but nothing produces a stamp until that step lands. The spoken-language
preference (Preferences, PRD-12/step 2.3, not built) doesn't exist yet either, so every note
currently records under Whisper's own auto-detection; `lang_source: 'preference'` and the
language-override plumbing already exist end to end in the adapter and API layer for step 2.3
to turn on without further backend changes.

Found and fixed a latent bug in step 0.6's own code, not new to this step: `hashApprovalPayload`
(`packages/shared/src/approval-hash.ts`) used `node:crypto`, which `apps/web/lib/approvals/
confirm-approval.ts` (a client component, step 0.6) already imported transitively through
`@procircuit/db`'s barrel export — but nothing had ever actually rendered a page that imported
it client-side, so Next.js's client webpack bundle had never needed to resolve `node:crypto`
and the break stayed invisible. This step's `match-scribe-client.tsx` is the first real screen
to import anything from `@procircuit/db` into a client bundle (for `getSavedNotesThisMonth`),
which surfaced it immediately as a hard webpack build failure. Fixed by switching to Web Crypto
(`crypto.subtle.digest`), a Node 20+ and browser standard, making `hashApprovalPayload` async;
updated both call sites (`packages/db/src/approvals.ts`, `packages/actions/src/gate.ts`, both
already inside async functions) and every test that called it. Verified against the real dev
server, not just the type checker: the match-scribe route now compiles and correctly redirects
an unauthenticated request to `/signin` (confirmed via the browser pane), where before the fix
it 500'd on every request with the `node:crypto` build error.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` all green across every
package (176 tests passing — 39 new in `apps/api`, 12 new in `packages/db`, 5 new in
`apps/web`'s offline-queue tests, plus 13 new RLS/quota-function integration tests in
`packages/db` that are skipped here and in CI without `SUPABASE_DB_URL`, same as every prior
step's integration tests). Applied all four migrations to the live project via the Supabase
MCP server (this project can't branch — see the Supabase bullet in CLAUDE.md — so straight to
production, confirmed with the owner before each of the four applies) and re-ran the security
advisor after each until clean of anything this step introduced. Started the real
`apps/web` dev server in the browser pane and navigated to `/match-scribe`: compiles cleanly,
redirects to `/signin` (no session in this sandbox), console/log output free of the earlier
build error.

Skipped, deliberately: PRD-08's Conditions stamp (step 3.3); the spoken-language Preferences
setting (step 2.3); step 1.2's structured extraction, so mood, result, opponent, tags and the
coach summary are entirely player-typed in this step, never agent-proposed; S-20 ("Good day to
write", Should) and S-21 (backdating a note, Could); PRD-13 admin ingestion of any kind;
Capacitor/native background upload and push (step 5.3/5.2) — the offline queue here only drains
while the tab is open or on the `online` event, which is the PWA-only ceiling
TECH-ARCHITECTURE.md section 1 already documents for iOS specifically.

### Follow-up · real Whisper and R2 configured, verified end to end, same day

The owner provided an OpenAI API key and, separately, a Cloudflare R2 account id, bucket name
(`audio-files`) and API token. Wired both into the owner's local `.env` (gitignored, never this
repo) rather than the app's own code or config.

Getting `apps/api` to actually run locally needed two more real credentials neither vendor
provided: `SUPABASE_SERVICE_ROLE_KEY` (retrieved from the dashboard's legacy API keys page,
which still exists as a "Reveal" action) and `SUPABASE_DB_URL`, which turned out to be
unrecoverable — Supabase never shows the database password again after creation. Reset it (owner
approved, since nothing else was using a direct Postgres connection to this project yet); the
new connection string uses the **session pooler** host
(`aws-0-ap-northeast-1.pooler.supabase.com:5432`), not the direct `db.<ref>.supabase.co` host,
because the direct host only resolves over IPv6 and that session's sandbox had none. Added
`dotenv`-based loading of a root `.env` to `apps/api/src/index.ts` (silent no-op under
`NODE_ENV=test` and in staging/production, where Fly.io/Render inject env vars directly) since
nothing previously loaded one.

First real transcription attempt failed with `insufficient_quota` from OpenAI (an empty credit
balance, not a bad key — confirmed by hand with a direct `curl` to the transcription endpoint,
since the failure was otherwise invisible: pg-boss marks a thrown job failed in its own tables
but nothing had ever logged *why*). Fixed both problems, not just the credit balance:
`registerNotesWorkers` now logs the note id and error before rethrowing on any job failure, and
`createNotesBoss` listens for pg-boss's own `error` event (an `EventEmitter` error with no
listener crashes the process rather than failing quietly) — both take an optional logger,
`console` by default, injectable in tests (`apps/api/src/notes/queue.test.ts`, new).

Also built `scripts/dev-sign-in-link.mjs` (plus a `pnpm dev:sign-in-link` root script) once
manual magic-link testing turned out to need it: it calls Supabase's admin API
(`/auth/v1/admin/generate_link`) to produce a sign-in link without waiting on real email
delivery, pointed at the app's own `/auth/confirm?token_hash=...&type=magiclink` — not
Supabase's default `action_link`, which targets its own auto-verifying `/auth/v1/verify`
endpoint and would have skipped straight past the anti-link-scanner design from step 0.3's
follow-up entry above. Also inserted a `players` row by hand for the owner's existing
`auth.users` row (`0396d886-...`), since onboarding (step 1.4) doesn't exist yet to create one
through the app.

Two real recordings were made end to end from a real browser session against this real
infrastructure: real audio, real `MediaRecorder` capture, real upload to apps/api, real Whisper
transcription (both transcripts correctly captured genuine speech, including one about a windy
match and lost patience, and one about a loss in China blamed on wind and humidity), player edits
in review, Save, and immediate audio deletion — confirmed directly against `public.notes`, not
inferred from the UI: `status = 'saved'`, `audio_ref` null, `audio_delete_cause = 'confirmed'`,
deleted within a minute of upload. R2 connectivity was verified twice: once with a raw
upload/download/delete round trip run directly against `createR2Adapter` (confirming the
account id, bucket and both keys are correct and paired correctly — the pasted values were
identified as key id vs secret purely from their length, 32 vs 64 hex characters, since the
owner's paste didn't label which was which), and once implicitly via the two real recordings
themselves, made while `apps/api`'s own startup log showed no "R2_* env vars not set" fallback
warning. Six earlier `failed_transcription` rows from before credits were added were deleted
(their audio was already unrecoverable: the in-memory storage fallback these fell back to during
that pre-credit testing had since been wiped by later restarts) — same delete path the app's own
Discard action takes for a never-saved note, run directly against the database rather than
through the UI.

Also discovered and fixed mid-session, unrelated to Match Scribe itself but blocking testing:
this session's own browser-pane preview server was running `next dev` against the same
`apps/web/.next` directory as the owner's own separately-run `pnpm dev:web`, corrupting each
other's build cache (`missing required error components`, a stale React Client Manifest error).
Stopped this session's own web preview and cleared `.next`; going forward, only the owner's own
dev server should run against `apps/web` in a session where they're testing live. Separately,
port 3000 turned out to be held by a stale, unrelated dev server left over from a different chat
session, not the owner's — their fresh `pnpm dev:web` had silently landed on a different port
instead, which is why an early sign-in link pointed at the wrong place and appeared to do
nothing.

Net result: step 1.1's own "Done when" criteria are now met against real infrastructure, not
mocks — the one item the original entry above flagged as unverifiable in-session ("an actual
live-microphone, live-Whisper, live-R2 walkthrough... needs both vendors configured and a
signed-in test player, neither available in this session") is no longer true. Housekeeping:
PRs #4 (step 0.5), #5 (step 0.6) and #6 (step 1.1) were merged into `main` in that order (each
had to be retargeted from its stacked base as the one before it merged) and all three branches,
local and remote, deleted.

## Step 1.2 · Structured extraction — 21 September 2026

Acceptance checks restated before starting: a transcript fixture produces a valid extraction in
tests with a recorded mock response; an invalid model response is retried once then fails
cleanly with the note left in review; cost is recorded on the run.

Built the first agent, `packages/agents/src/match-scribe/` (`extract.ts`, `schema.ts`,
`prompt.ts`, `model-client.ts`, `mock-client.ts`): one Anthropic call (`claude-sonnet-5`, the
only model family `packages/actions`' pricing table already knows, matching its own
`record-run.test.ts` fixture) made via a plain `fetch` against the Messages API with tool use
forced to a fixed input schema, the same "adapter over a raw vendor call" shape
`transcription/whisper-adapter.ts` already established rather than adding an SDK dependency. A
Zod schema (version `v1`) validates the response — result against the "W/L, sets, optional
tiebreak" grammar, tags against the player's own vocabulary (a `.refine()`, since the vocabulary
is per-player, not static), mood plus the extractor's self-reported confidence — with exactly
one corrective retry on failure (both attempts' token usage summed onto the single `agent_runs`
row `packages/actions`' `recordRun()` writes) before throwing `AgentValidationError`. Result,
opponent, round and surface are only ever kept for a Match note (S-3) regardless of what the
model returned; mood is only kept at or above the 0.6 confidence placeholder (PRD-02 section 7,
same number the decisions worksheet already flags as needing review against real transcripts).

Two inputs PRD-02 section 3 lists — the current Entered event (for round/surface) and PRD-08's
forecast/fact sheet (for the conditions stamp) — don't exist yet (Tournament Agent is step 3.2,
Conditions is step 3.3), the same gap step 1.1 already hit for the stamp column. Skipped the
same way: the schema carries a `conditions` field that this agent always sets to `null`
(reserved, backfilled once step 3.3 exists), and round/surface are only ever filled from what
the model reads directly in the transcript, never enriched from event data.

Wired into `apps/api`: `notes/extraction.ts`'s `runExtraction()` calls the agent right after
`transcribeNote()`'s own transcription succeeds (`notes/service.ts`), in the same job, and
merges the proposal onto the note (`result`, `opponent`, `round`, `surface`, `tags`, `mood`,
`summary`, `extraction`) before setting `status: 'review'`. `collectTagVocabulary()` unions the
starter set with every tag the player has already used on their own notes, there being no
separate vocabulary table. A failure — validation or a real vendor/infra error alike — sets
`status: 'failed_extraction'` (already a distinct value in step 1.1's status enum, anticipating
this) and is logged but deliberately never rethrown: rethrowing from inside the note-transcribe
job would misreport an extraction failure as a transcription one in that job's own log line, and
the note row is already the correct outcome for the player to act on (S-19, S-7's "We couldn't
read a result from this" case).

S-19 ("transcription failure and extraction failure are distinct states with Retry that never
lose the audio or typed text") needed a second failure mode `apps/web`'s recorder card didn't
have yet: added the `failed_extraction` banner with PRD-02's own copy, and a `note-extract`
pg-boss queue separate from `note-transcribe` so retrying a stuck extraction re-runs only the
agent against the already-durable transcript, never re-downloads or re-transcribes audio.
`retryTranscription` became `retryNote`, a single dispatcher both the route and the client call
regardless of which of the two states a note is in, rather than two client-visible endpoints.

Skipped, deliberately: the two upstream inputs above (Entered event, Conditions stamp); a
dedicated "Extracting" UI state (the retry path reuses the existing "Transcribing" badge/spinner
rather than adding a new one, a minor label mismatch traded for not touching more of the
recorder card than necessary); "Good day to write" (S-20, PRD-02 itself asks whether it belongs
here or in Mindset Coach); a persisted per-player tag-vocabulary table (vocabulary is derived
from prior notes' `tags` at call time instead).

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm format` and `pnpm test` are all green across every
package — 74 new or updated tests (22 in `packages/agents` covering the schema, the proposal
merge and the retry-once orchestration against a scripted mock model client; the rest in
`apps/api` covering `runExtraction`, the tag-vocabulary query, the `note-extract` queue and
`retryNote`'s two branches). Started this session's own `apps/web` and `apps/api` dev servers
against the real Supabase, R2 and Whisper infrastructure step 1.1 already configured (this
session's `apps/api` correctly logged "ANTHROPIC_API_KEY not set: falling back to the mock
extraction client", confirming the fallback wiring) and, signed in via a dev sign-in link, loaded
`/match-scribe` cleanly against the two real notes from step 1.1's own live verification, no
console errors. Did not attempt a live Anthropic-backed extraction end to end: no
`ANTHROPIC_API_KEY` is configured in this session's `.env`, and this sandbox has no real
microphone to record a fresh note through the browser regardless — the same category of gap step
1.1's first pass flagged before its own same-day follow-up. Whoever adds a real Anthropic key
should re-verify a live note against it, the way step 1.1's follow-up did for Whisper and R2.

### Follow-up · switched the extraction agent from Anthropic to OpenAI, verified live, same day

The owner asked why the agent used Anthropic when `OPENAI_API_KEY` was already configured and
paying for Whisper — the earlier choice had no real basis (nothing in the PRDs or
`TECH-ARCHITECTURE.md` names a vendor; `packages/actions/src/pricing.ts` just happened to only
have Claude entries from step 0.6, before any agent existed). The prototype's own reference
copy for comparable structured-extraction tasks (PRD-03's receipt scanning, PRD-07's menu
scanning) names "GPT-4o mini · structured extraction" specifically, not the heavier model those
same PRDs use for a whole agent's scheduled run — `match-scribe/extract` is the same shape of
task (a small transcript in, a small JSON object out), so `gpt-4o-mini` follows that precedent
rather than picking arbitrarily.

Changed `packages/agents/src/match-scribe/model-client.ts` from an Anthropic tool-use call to
OpenAI's Chat Completions API with `response_format: { type: 'json_schema', strict: true }`
(the same hand-written JSON Schema as before, `additionalProperties: false` and everything in
`required`, which strict mode needs); `EXTRACTION_MODEL` in `extract.ts` from `claude-sonnet-5`
to `gpt-4o-mini`; added a `gpt-4o-mini` row to `packages/actions/src/pricing.ts`. Simplified
`apps/api/src/index.ts` to reuse the same `OPENAI_API_KEY` and `openaiApiKey` variable already
wired for Whisper, rather than a second env var — one OpenAI account now covers both vendor
calls this step needed, no `ANTHROPIC_API_KEY` anywhere any more. Nothing else changed: the Zod
schema, the retry-once orchestration, the note-merge logic and every test that isn't
model-client-specific are all vendor-agnostic by design (the whole point of the
`ExtractionModelClient` boundary), so none of that needed touching.

Verified live this time, unlike the first pass: `OPENAI_API_KEY` is already configured in this
session's `.env` (it was already there for Whisper), so a small one-off script (run via
`apps/api`'s own `tsx`, deleted after use) called the real `extractMatchNote()` against the real
OpenAI API with the same Kovalenko fixture transcript service.test.ts already uses. It produced
a correct, schema-valid extraction on the first attempt, no corrective retry needed: result
`"L 6-4 3-6 6-7(5)"`, opponent `"Kovalenko"`, tags `["Second serve", "Tiebreak"]`, mood
`"frustrated"` (above the 0.6 confidence floor), and a sensible one-line coach summary, for 1,049
input and 153 output tokens — about $0.00025 at the table's own rate, comfortably inside PRD-02's
combined under-$0.05-per-note target alongside transcription's own ~$0.006. `pnpm typecheck`,
`pnpm lint`, `pnpm format` and `pnpm test` all still green (added one pricing-table test case for
`gpt-4o-mini`; every other test file needed no changes, confirming the adapter boundary held).

## Step 1.3 · Mindset Coach — 21 September 2026

Acceptance checks restated before starting: with five fixture notes the pattern "After a
tiebreak loss, you write about rushing the second serve" appears with 3 of 4 evidence; a note
matching the distress lexicon shows the card and writes a `cases` row; the insight is not
regenerated when nothing changed; the copy never uses clinical language (a test greps the
prompt output against a blocklist); the route matches the prototype at `#/agent/mindset`.

Migration (`packages/db/migrations/20260921110000_step_1_3_mindset_coach.sql`) adds `patterns`,
`insights`, `mindset_boundaries` and `cases`. `patterns` is keyed on `(player_id, rule_key)`
rather than freely created per run — PRD-06 section 7's three worked examples read like a small,
fixed catalogue of candidate statements a detector evaluates each run, not open-ended text
generation, so a pattern's identity is the rule that produced it, which is also what makes
dismiss-then-re-raise (MC-11) an update to the same row rather than a duplicate. `cases` is
TECH-ARCHITECTURE.md 2.4's admin table, built now (ahead of the admin console itself, PRD-13
Phase 5) because M-PRIV-3/MC-16 require the distress card to open a case from week one; no role
has a select grant on it, since a player must never see their own case row. `mindset_boundaries`
is a dedicated table rather than a reuse of `agent_schedules.paused`: that column is the generic
admin/Elite-Studio kill switch the queue's pickup guard already reads for every agent, a
different concern from a player's own "Pause for a week" (MC-15), which needs a resume date and
"resumes automatically, deletes nothing." Applied to the live project via the Supabase MCP server
after the owner confirmed (this project can't branch); the security advisor's only new finding
was the intentional no-policy state on `cases`, everything else pre-existing. Regenerated
`packages/db/src/database.types.ts` from the live schema afterward.

Built the second agent, `packages/agents/src/mindset-coach/` (`rules.ts`, `merge-patterns.ts`,
`distress.ts`, `schema.ts`, `prompt.ts`, `model-client.ts`, `mock-client.ts`,
`generate-insight.ts`). The pattern detector is deterministic, not LLM-driven: PRD-06's three
worked examples key off structured columns step 1.2's extractor already fills in (result grammar,
tags, ctx, mood), so `rules.ts` is a small catalogue of rules over those columns rather than a
semantic-clustering pipeline — cheaper, auditable, testable without a model in the loop. The
generative model's only job is the morning's 1-3 sentence prose plus a focus sentence, given
counts and flags the caller already computed; it never invents a pattern statement, a re-raise
sentence or a dismissal notice, all of which are deterministic, player-visible UI copy driven
directly by pattern-row state. Three rule types: `tiebreak_loss_second_serve` (a losing tiebreak
set + the `Second serve` tag), `travel_next_day_flat` (a note the local calendar day after a
Travel note + `flat` mood), and `conditions_first_serve_drop` (the physical/Conditions kind,
reading `notes.cond` — always null until PRD-08/step 3.3 exists, so this rule is structurally
real but never actually fires in production yet, exercised only by `rules.test.ts`'s own fixture
with a stamp shape this step defines, since PRD-08 doesn't exist to define one). A fourth worked
example from the PRD, "you skip writing after wins," was deliberately not built: it needs known
match results outside notes (`entry_decisions`/tournaments, step 3.2), which don't exist yet — the
same category of upstream-input gap steps 1.1/1.2 already hit for the Entered event and the
Conditions stamp, handled the same way (documented, not faked). The distress rule
(`distress.ts`, M-PRIV-3) is a deterministic evaluator, not a model call: an English-only lexicon
(PRD-06 section 12 flags per-language review as an open question, not something to guess at
here), three consecutive check-ins of 1, or five of the last seven notes Frustrated/Flat with
`Sleep` tagged on at least three. `generate-insight.ts` is the orchestrator: evaluates distress
first and unconditionally (pre-empting everything else, no model call), then quiet-match-morning
(MC-14, structurally real but never triggered today since `hasMatchToday` has no real input until
the Tournament Agent, step 3.2), then runs the pattern detector, builds the prompt (light-morning
and feedback-adaptation flags per section 7), and calls the model with the same one-corrective-
retry-then-`AgentValidationError` shape step 1.2 established, plus a second, independent
regenerate-once-then-withhold path for a tone-check failure (AC-11) — two different retry
policies for two different failure classes, not one generic retry loop. `gpt-4o-mini`, the same
OpenAI account as Whisper and match-scribe/extract; the page's own badge reads "Drafting model ·
06:00 your time," not the prototype's literal "Claude Sonnet" copy, since CLAUDE.md's "no model
provider names in the interface" rule supersedes that pre-decision prototype text.

MC-18's memory quote (semantic similarity over embeddings) is out of scope for this step and not
in the build plan's own "Done when" list: it needs an embeddings call and a vector index
(pgvector), a distinct vertical slice this step didn't touch — `memory` is always null, the same
"wire the field, defer the real value" pattern already used for `rankingDelta`/`nextEvent`
(step 3.1/3.2 inputs that don't exist yet either).

Wired into `apps/api/src/mindset-coach/`: `service.ts` (DB reads/writes on the service role),
`run.ts` (`runMindsetCoach`: loads the player, checks `mindset_boundaries.paused_until` *before*
loading anything else — a paused player gets no insight row at all this morning, not a row that
says "paused," matching "deletes nothing" — computes the inputs hash for MC-1's caching, then
wraps `generateInsight` in `recordRun()`, writes the insight/pattern rows, opens a `cases` row on
distress, and sends at most one notification), `scheduler.ts` (the hourly tick that finds players
due for their delivery hour — a fixed 06:00 default, since Settings > Agents' own cadence picker
doesn't exist yet, PRD-12 step 2.3 — and enqueues onto `packages/actions`' `AGENT_RUN_QUEUE`), and
`worker.ts` (registers the pickup-guard-aware worker). Mindset Coach is the **first agent to
actually run on the `AGENT_RUN_QUEUE`/`registerAgentWorker` infrastructure** step 0.6 built ahead
of any agent needing it — match-scribe/extract runs inline in the note-transcribe job instead,
never touching that queue. The nightly 02:00 UTC overnight pattern-detection run PRD-06 section 3
separately mentions was not built as its own cron: pattern detection is cheap (no model call) and
already runs fresh inside every daily insight run, so a second scheduled pass would only
duplicate work for no player-visible difference — a deliberate simplification, not an oversight.

UI: `apps/web/app/(app)/agent/mindset/` (`page.tsx`, `mindset-client.tsx`) and
`apps/web/components/mindset/` (`today-card.tsx`, `boundaries-card.tsx`, `patterns-card.tsx`,
`mood-chart.tsx`, `recent-mornings-card.tsx`, `someone-to-call-card.tsx`). Extracted
`check-in-card.tsx` as the one shared implementation of MC-5's "saved from the Mindset page, the
dashboard or Match Scribe" — `match-scribe/daily-checkin-card.tsx` (step 1.1) is now a five-line
wrapper over it, and the dashboard (`apps/web/app/(app)/page.tsx`) gained the mood row this step's
own build-plan line names ("The dashboard mood row"), converted to an async server component that
fetches the player row the same way `match-scribe/page.tsx` already does — the rest of the real
three-answers dashboard wiring stays step 1.4's job, untouched here. `mood-chart.tsx` reuses
`packages/ui`'s `el()`/`axisK()` chart helpers (`sample-rank-chart.tsx`'s own pattern) but is
deliberately narrower than the prototype's `drawMood()`: no shaded tournament weeks and no
pattern-callout dashed lines, both needing Entered-event and pattern-to-chart-date linkage that
don't exist yet. Free-tier locking (MC-20) dims patterns/chart/boundaries/recent-mornings with a
"Start Pro trial" placeholder action (no real Stripe trial flow exists yet, Phase 4) —
`players.tier` is nullable free text with nothing populating it before onboarding (step 1.4), so
`null` reads as Free, the safer default. `someone-to-call-card.tsx` deliberately does **not**
hardcode a phone number for the ATP Player Assistance line or any crisis line: a guessed or
unverified number on a card a player in genuine distress might call is actively dangerous, worse
than an honest gap (M-PRIV-5's real-person-governance principle applied here) — it names the
resources without inventing digits for them, flagged with an explicit comment not to fill one in
without confirming it against the real program and the player's own country.

**Found and fixed a latent bug from step 1.1**, not new to this step: `saveCheckIn()`
(`packages/db/src/notes.ts`) used `.upsert()` on `(player_id, date)`, which PostgREST turns into
`INSERT ... ON CONFLICT (player_id, date) DO UPDATE SET <every column in the payload>` — including
`player_id` and `date` themselves, even though their values never change on a same-day re-save.
The step 1.1 migration deliberately never grants `authenticated` UPDATE on those two columns
(only `value`, `sentence`, `source`), so the upsert failed with "permission denied for table
check_ins" the moment a second check-in save happened on the same day. Never caught before now
because nothing had actually exercised a same-day re-save against production live: step 1.1's own
match-scribe check-in card existed but this is the first time this step's shared
`check-in-card.tsx` got a real, repeated, live-browser click test. Confirmed live against the
project (not just inferred): the first save 403'd with exactly that error; fixed by rewriting
`saveCheckIn` as an update-then-insert-if-missing (two statements matching the grant exactly,
instead of relying on upsert's broader generated SQL) and re-verified — a second save on the same
day correctly updated the existing row (`4` → `3`) with no new row and no error. Updated
`notes.test.ts`'s `saveCheckIn` tests to match (they'd mocked `.upsert()` directly, which no
longer exists in the implementation).

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm format` and `pnpm test` all green — 216 tests total
across every package (54 in `packages/agents` covering the pattern rules, the merge/re-raise
logic, the distress lexicon and thresholds, the tone-check blocklist and the full orchestrator
including MC-AC-1/3/8/10/11-style fixture scenarios; 59 in `apps/api` including `run.test.ts` and
`scheduler.test.ts`, new; 24 in `packages/db` including `mindset.test.ts`, new). Verified against
the real OpenAI API, not just mocks, the same standard step 1.2 set: a one-off script (deleted
after use) called `generateInsight()` with a real `createOpenAIInsightClient` against four
in-memory fixture notes (three tiebreak losses, two tagged `Second serve`) — it produced a valid,
tone-clean insight and focus on the first attempt, correctly flagged
`tiebreak_loss_second_serve` as new at Strong confidence (3 of 3), for 542 input and 32 output
tokens (about $0.0001, comfortably under the A$0.08 target). Also verified live in the browser
against the real deployed project, signed in via a dev sign-in link: the dashboard's mood row and
the full `/agent/mindset` route (empty "starts after your third note" state, dimmed Free-tier
sections, the mood chart, boundaries, patterns and recent-mornings cards) all rendered correctly
in both a fresh load and after the check-in bug fix above; no console errors after the fix.

Skipped, deliberately: the memory quote (MC-18, needs embeddings/pgvector, its own vertical
slice); the "you skip writing after wins" pattern (needs `entry_decisions`, step 3.2); the
Coach view's patterns section (`#/coach`) and any share-link auth — `share_links` exists as a
table (step 0.2) but nothing yet issues or resolves a token (PRD-12, step 2.3), and the route is
still the same "not built yet" placeholder step 0.5 left it as; `patterns.coach_share` is wired
and ready for that step to read. A per-player delivery-hour setting (Settings > Agents' 06:00/
07:00/Evenings picker) — every player currently gets the one hardcoded 06:00 default. A separate
02:00 UTC nightly pattern-detection cron (see above for why). Real Stripe-backed "Start Pro
trial." A named personal contact and a sourced per-country crisis line on the someone-to-call
card (needs Settings > Connections, PRD-12).

## Step 1.4 · First-week dashboard and onboarding without feeds — 21 September 2026

Built the four-step onboarding wizard (`#/onboarding`) and the first-week dashboard (`#/`) from
PRD-11, PRD-00 section 3 (stage detection) and section 5.2 (M-ID-2, M-ID-3), and decisions
worksheet 1 and 2 — the two decisions PRD-11 section 12 flagged as unbuilt in the prototype
(the guardian branch, the ambiguous-match chooser and the unverified path) were the actual scope
of this step, not the prototype's own markup, which has neither.

A migration (`packages/db/migrations/20260921120000_step_1_4_onboarding.sql`, applied to
production per the owner's confirmation — this project still can't branch, step 0.6's note
stands) added the wizard's fields to `players` (`handed`, `tour_player_id`, `itf_id`, ranking
fields named `tour_rank`/`tour_points` rather than `atp_rank`/`atp_points` per M-STG-3, `stage`
inputs, `target_rank`, `key_tournaments`, `surfaces`, `weekly_budget`, `blocked_dates`,
`billing_cycle`, `dashboard_state`, the two onboarding timestamps) and, more structurally,
`players`' first-ever INSERT policy: step 0.2 wrote `players_select_own`/`update_own` but nothing
before this step ever created a player's own row (auth, step 0.3, only creates `auth.users`).
Also added `agent_schedules_insert_own`/`update_own` (previously select-only) so step 4's agent
toggles can write `agent_schedules.paused` directly rather than needing a new column — "off" in
step 4 becomes a `paused: true` row for that agent, "on" leaves no row, matching step 0.6's own
documented "no row = not paused" default. Deliberately did **not** add a `ranking_snapshots`
table even though TECH-ARCHITECTURE.md 2.2 describes one: that table is "one row per weekly
refresh," fed by a real feed and a Monday job neither of which exists until step 3.1: the ranking
values this step actually needs (onboarding's one-time lookup, stage detection off it) live
directly on `players` instead, additive to extend later. `database.types.ts` regenerated from the
live schema via the Supabase MCP server.

The ranking lookup itself is the one call with a real (eventual) vendor side effect, so it got the
same adapter treatment as R2/Whisper/OpenAI (`apps/api/src/rankings`): a three-way
`RankingLookupResult` (`verified` | `ambiguous` | `unverified`) behind a `RankingLookupAdapter`
interface, a `POST /rankings/lookup` route, and — unlike those three adapters — no real
implementation at all yet. The only one registered in `apps/api/src/index.ts` is
`createUnverifiedRankingAdapter`, which always returns `unverified`: the build plan's own words
for this step ("the ranking lookup behind an adapter that returns 'unverified' until step 3.1
exists"). A `createFixtureRankingAdapter` proves the `verified` and `ambiguous` shapes are correct
now, ahead of step 3.1 giving the adapter something real to call — exercised by
`apps/api/src/rankings/routes.test.ts` and, on the client side, by the ambiguous-match-chooser
test in `onboarding-wizard.test.tsx`, injected via the wizard's `lookupRankingFn` prop.

`packages/db/src/players.ts` holds the pure logic: `detectStage` (PRD-00 section 3's thresholds,
read off a plain tour-agnostic rank per M-STG-3), `ageFromDob`/`isMinor`/
`requireGuardianEmailIfMinor` (a hard blocker per decisions worksheet 1, checked again
server-side even though the wizard also blocks it client-side), `canPublishProfile` (the pure
predicate a later public-profile-editor step gates on — no editor exists yet, so this is proven
by fixture test only), `countryDefaults` (fixes the PRD-11 section 12 inconsistency: the country
select "wired to nothing" — home currency, timezone and app language now really do come from the
country chosen in step 1, for the seven countries the step 1 form offers; unlisted countries fall
back to AUD/UTC/en, the same effective default Preferences already used), and `finishOnboarding`,
onboarding's single write. It is an `upsert` keyed on `id`, not a plain insert: OB-17's "Replay
setup" reopens onboarding "without discarding existing answers" for a player who already
finished it once, and since every column the function writes is listed explicitly, the generated
`ON CONFLICT DO UPDATE` never touches `guardian_confirmed_at` or the `deletion_*` audit columns.
`agent_schedules` writes are upserted the same way for the same reason, with one known gap noted
in the code: replaying onboarding and switching a previously-off agent back on does not un-pause
its existing row, since nothing in this build has a pause/resume surface to do that (Agent
Studio, Elite-only, a later phase).

The wizard itself (`apps/web/components/onboarding/onboarding-wizard.tsx`) lives in a new
`(onboarding)` route group rather than the existing `(bare)` one signin and the coach view use:
the prototype's onboarding column is 760px and left-aligned content, `(bare)`'s `BareShell` is a
400px centred column built for signin, and reshaping a shared shell for one route risked
regressing the other two for no benefit — a sibling route group keeps the URL (`/onboarding`) and
the auth-gate-in-the-layout pattern `(app)/layout.tsx` already established, without touching
either. All four steps' fields come from PRD-11 section 6's data dictionary, not the prototype's
own step 1 markup verbatim — the prototype's step 1 also has dietary-rules and food-budget fields
that belong to Fuel (PRD-11 doesn't list them at all), left out. The tour toggle (ATP/WTA) and a
single tour-agnostic ID field are new relative to the prototype, which only ever shows "ATP player
ID" (PRD-11 section 12 flags this as unbuilt too). No answer is persisted before step 4 finishes
(PRD-11 section 3's own stated design), so the whole wizard is client component state until one
Server Action call (`app/(onboarding)/onboarding/actions.ts`) does the real write via RLS.

The dashboard (`apps/web/app/(app)/page.tsx`) now branches on `players.dashboard_state`: a
player who has finished onboarding (`'first'`) renders `FirstWeekDashboard`
(`apps/web/components/dashboard/first-week-dashboard.tsx`) instead of the pre-onboarding empty
shell, which now only covers "no players row exists yet." The hero, checklist and Mindset Coach
progress read real data (`player.verification`/`tour_rank`/`stage`, a notes count via the already-
tested `listNotes`); Runway, the Tournament Agent shortlist and Patrons keep the same honest
zero-state tiles step 0.5 shipped, since the Financial, Tournament and Fans agents that would fill
them don't exist until Phase 2 to 4 — this step's own title ("without feeds") is exactly that
scope line.

Done-when checks: a fixture test (`players.test.ts`) proves `finishOnboarding` throws
`GuardianEmailRequiredError` before writing anything for an under-18 player with no guardian
email, and a component test (`onboarding-wizard.test.tsx`, real DOM interaction via
`@testing-library/react`) proves the wizard itself blocks "Continue" past step 1 for the same
case and unblocks it the moment a guardian email is typed. `canPublishProfile` is fixture-tested
false for `verification: 'unverified'` (M-ID-2) and false for a verified minor with no confirmed
guardian (M-ID-3) — no publish surface exists yet to wire it into, so this is the acceptance bar
this step can actually clear. The ambiguous-match chooser and the unverified badge are both
proven via the same component test file, since the production adapter cannot currently produce
either verified or ambiguous results itself.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm format` and `pnpm test` all green — 220 tests total
across every package (20 new in `packages/db`'s `players.test.ts`, 5 new in `apps/api`'s
`rankings/routes.test.ts`, 4 new in `apps/web`'s `onboarding-wizard.test.tsx`).

**Follow-up verified live in the browser**, in the merge-review pass after the dev-server slot
freed up: reused the already-running `web` dev server (`apps/api` still could not be started —
slots stayed at capacity — so the ranking lookup itself was exercised against a genuinely dead
API, not a mock). Against the owner's own real signed-in session (`manu.dadubey@gmail.com`, an
existing players row from earlier manual testing, country Italy): `/onboarding` rendered the
wizard correctly with that row's data prefilled, including the "Unverified" badge and Continue
button already resolved from a prior real lookup attempt against the same dead API (a live,
unplanned confirmation that the `catch` block's graceful-degrade-to-unverified path works, not
just the fixture-adapter test of it). Changed the date of birth live to a minor date: the guardian
email field appeared with the exact copy above and the Continue button's `disabled` flipped to
`true` (confirmed via direct DOM inspection, not just visual read); typing a guardian email
flipped it back to `false`. Neither of these touched the database (client-only state before step
4's submit), so the account's real data was left untouched — deliberately did not click "Open my
dashboard" with placeholder test data to avoid overwriting it. Then loaded `/` fresh: the
first-week dashboard rendered correctly against that same real row — Stage 1 · Building, the
Unverified badge and "Verify your ranking" link, the three pulse tiles, a "2 of 4 done" checklist
(ranking/Tournament-Agent and the first note both correctly ticked off from real data, balance and
public-page correctly still pending), and all three agent cards including a working Mindset Coach
check-in card reading "2 of 3 notes." No console errors beyond a benign favicon 404 and the
expected `apps/api`-is-down connection-refused (surfaced exactly where expected: the ranking
lookup call, nowhere else).

Skipped, deliberately: the six-step spotlight walkthrough tour (`TOUR` in the prototype) — the
build plan's own step 1.4 line lists "the tour toggle (ATP, WTA)" among what to build, which is
the ATP/WTA tour selector, not the walkthrough; the walkthrough itself is absent from that line
and from this step's Done-when criteria. The public profile editor (`#/profile`) — PRD-11 owns it
but the build plan never schedules it under step 1.4 (it stays the same placeholder step 0.5
left), so `canPublishProfile` exists now with no editor yet to call it. Photo upload in step 1 (no
acceptance criterion needs it; the prototype's field is a hardcoded base64 sample image with no
real storage behind it). Real Stripe trial creation in step 3/4 — `tier`/`tier_status` are set
directly (`trialing` for Pro/Elite, `free` for Free) with no Stripe API call, the same stubbing
pattern this step's own ranking adapter uses, since Phase 2 is where Stripe gets wired up. The
"Show me a full season instead" sample-season toggle — nothing exists yet to populate a full
season with (Tournament, Financial and Fans agents are all later phases), so `dashboard_state`
never reaches `'full'` in this build. Onboarding's guardian-confirmation email itself (the
guardian receiving and clicking a confirm link) and the 14-day-unconfirmed admin case decisions
worksheet 1 describes — `guardian_email` and `guardian_confirmed_at` are stored and
`canPublishProfile` already gates on the latter, but nothing sends that email yet: there is no
share-link/manager-invite surface built at all to hang it on (PRD-12, a later step), and inventing
a bespoke one-off email path for just this field seemed worse than leaving the column honestly
unconfirmed until that surface exists.

## Step 2.1 · The FX archive and the ledger — 21 September 2026

Read first: TECH-ARCHITECTURE section 2.1, PRD-03 sections 3, 6, 7, PRD-00 M-DATA-1, M-DATA-2,
M-CUR-1.

Built: three new tables (`ledger_lines`, `prize_receivables`, `reserve_entries`) alongside the
`fx_rates_daily` archive step 0.2 already created, plus an additive extension of
`approvals.action_type` to add `receivable_received` — the one transition
TECH-ARCHITECTURE.md section 3 names explicitly, alongside the Stripe/Resend/ICS clients, as
something only `packages/actions` may perform ("or transition a `prize_receivables` row to
received"). `packages/db/src/ledger.ts` holds the money model's one formula (`convertAtRate`:
original-to-EUR divided by target-to-EUR for the row's own `fx_rate_date`, never a live re-fetch)
and `insertLedgerLine`/`listLedgerLines`/`getFxRate`/`getFxRates`; no home-currency amount is ever
stored, only original amount, currency and the locked rate date, which is what makes a later
currency-preference change alter zero rows. `packages/db/src/reserves.ts` holds
`enterReserveBalance` (a plain RLS-scoped player write, same as onboarding's `finishOnboarding` —
no vendor call, so it doesn't need the actions module) and `listPrizeReceivables`.
`packages/actions/src/receivables.ts` holds `markReceivableReceived`, the first real caller of
step 0.6's `runGatedAction` in this codebase: it realises the player's net share (gross ×
`player_share`, less withholding) at the received date's archived rate and adds it onto the
latest reserve balance with `cause='received_prize'`, a reserve-entry cause the RLS insert
policy's own `with check` refuses a player from writing directly (only this gated action can).

The daily ECB fetch lives in `apps/api/src/fx/`: `ecb-adapter.ts` calls the real, free, key-less
`eurofxref-daily.xml` feed (a small regex parser, `parseEcbDailyXml`, rather than pulling in a
general XML-parsing dependency for one stable, non-user-controlled format) and is the only
production implementation, same as step 1.4's `unverified-adapter` — no fixture-vs-real branch in
`apps/api/src/index.ts` was needed since the feed needs no credentials. `fx/service.ts`'s
`fetchAndStoreDailyRates` is idempotent and handles PRD-03's provisional-rate failure behaviour:
"an unpublished ECB rate saves as provisional and is re-rated once, both rates audited" — an
hourly tick (`fx/scheduler.ts`) either finds today's row already archived (no-op), writes a
provisional row carried forward from the last published date (before ECB's own publish time, or
on a weekend/holiday), or writes the real `ecb` row once the feed catches up, all on a new,
step-2.1-only pg-boss instance (`apps/api/src/money/queue.ts`) separate from packages/actions'
`AGENT_RUN_QUEUE`, since neither this job nor the reminder below is a scheduled agent run (no LLM
call, no `agent_runs` row).

The Sunday reserve-balance reminder (PRD-03 F-4, default on) is `apps/api/src/reserves/scheduler.ts`,
the same hourly-tick/pure-predicate shape as step 1.3's `mindset-coach/scheduler.ts`
(`playersDueThisWeekAtHour`, day-of-week plus local hour, fully unit-tested with the same
Sydney/Los-Angeles DST fixture style), extended to also skip a player whose `financial` agent
schedule is paused (the pause/kill-switch check TECH-ARCHITECTURE section 3 describes at the
job-pickup step, reused here even though this isn't an `AGENT_RUN_QUEUE` job). No per-player
`#balRemind` toggle or quiet-hours suppression exists yet (Settings, step 2.3) — every player
currently gets this one default, the same kind of deliberate skip step 1.3 documented for its own
delivery-hour setting.

Migration design notes (see the migration file's own header for the full write-up): `ledger_lines`
and `prize_receivables`' `tournament_id` is a plain `uuid` with no foreign key yet, since
`tournaments` doesn't exist until step 3.1 and migrations here are additive-only, not reorderable.
`prize_receivables` has no insert policy for `authenticated` at all — PRD-03 F-9 says a receivable
"is created from results," i.e. eventually the Tournament Agent (step 3.2); until then rows come
from the service role, matching how this step's own RLS integration tests seed one. A check
constraint (`prize_receivables_realised_fields_match_status`) ties `status = 'received'` to having
all three `realised_*`/`received_at` fields set and vice versa, so "only a received transition
writes the realised figures" is a database invariant, not just an application convention.
`reserve_entries`' insert policy restricts a player-authored row to `cause = 'player'` via its own
`with check`, structurally blocking a player from forging a `cause = 'received_prize'` row
directly, the same "enforced by code/schema structure, not convention" ethos TECH-ARCHITECTURE
section 3 states for the approval gate itself.

Done-when checks: `packages/db/src/ledger.test.ts`'s `M-DATA-1: convertLedgerLine` block is the
PRD's own acceptance example made literal — a €38.50 line dated 10 September converts correctly to
both AUD and USD at that date's archived rates, computed independently from the original EUR
amount each time (never chained through an already-converted figure), and the line's own
`amount_original`/`currency_original`/`fx_rate_date` fields are asserted unchanged after both
conversions, proving a currency-preference change alters no stored row.
`packages/actions/src/receivables.test.ts` proves a receivable marked received creates exactly one
realised reserve entry (net share × the received-date rate, added onto the latest balance) and
never before — a not-found/already-received receivable, a missing archived rate, or a second call
under the same approval all throw before `applyReceivedTransition` runs.

**Verified against the real Supabase project** (`gpzpmrumwaqyfkyvqbgl`), not just fixtures, since
this project can't branch (owner confirmed applying the migration directly, as every migration
here has to): applied `step_2_1_money_model`, ran `get_advisors` (no new findings — every new
table has an explicit RLS policy), regenerated `database.types.ts`, then wrote and ran six new
integration tests in `packages/db/src/rls.integration.test.ts`'s `money model row-level security
(step 2.1)` block directly against the live database (`SUPABASE_DB_URL`, not skipped): a player
can read only their own `ledger_lines`/`prize_receivables` rows, can insert their own
`ledger_lines` and `reserve_entries` (with `cause='player'`) rows but is refused inserting under
another player's id or with `cause='received_prize'`, is refused inserting a `prize_receivables`
row at all (no policy exists), and the realised-fields check constraint fires both directions. All
six passed on the first fully-corrected run. `pnpm typecheck`, `pnpm lint`, `pnpm format` and
`pnpm test` are all green — 254 tests passing across every package (13 new in
`packages/db/src/ledger.test.ts`, 3 in `reserves.test.ts`, 4 in `packages/actions/src/receivables.test.ts`,
4 in `apps/api/src/fx/ecb-adapter.test.ts`, 4 in `fx/service.test.ts`, 6 in
`reserves/scheduler.test.ts`, plus the six live integration tests above, counted only when
`SUPABASE_DB_URL` is set locally).

**Found but not fixed, flagged as a follow-up task**: running the RLS integration suite live for
real (apparently the first time since step 1.1, since it's normally skipped) surfaced 5
pre-existing failures in the unrelated `notes row-level security and quota (step 1.1)` block —
a test-only bug (the shared `asPlayer` helper always rolls back its transaction, but several notes
tests write inside one `asPlayer` call and assert on the result in a separate later call or a raw
query outside any `asPlayer` wrapper, so the write never actually persisted for them to see; the
DELETE test also runs unwrapped, meaning it executes as the raw superuser connection rather than
the `authenticated` role it means to test). Not a schema or RLS regression as far as this session's
investigation went, and out of step 2.1's scope, so left for a follow-up session rather than fixed
here.

Skipped, deliberately: an actual gated write path (approval creation plus a Financial Agent
"Update balance" button or a receipt-scan "mark received" action) for `enterReserveBalance` and
`markReceivableReceived` — PRD-03's `#/agent/financial` page, its ledger card and its `#balSave`
control are explicitly step 2.2's build items, not this step's; this step proves the gate and the
money model with directly-inserted approvals (the same pattern `gate.test.ts` already established
for `runGatedAction`), not a UI. Runway, net burn, the fourteen-week projection, budget versus
actual and receipt scanning — all explicitly step 2.2 (Financial Agent). Quiet hours and the
per-player reminder toggle — step 2.3 (Settings). The `tournaments` foreign key on `ledger_lines`
and `prize_receivables` — step 3.1, once that table exists.

## Step 1.1 follow-up: fixed the notes RLS integration test bugs flagged during step 2.1

**Found and fixed a latent bug from step 1.1**, not new to this step: the 5 pre-existing failures
in `rls.integration.test.ts`'s `notes row-level security and quota (step 1.1)` block, flagged but
left unfixed at the end of step 2.1 (see that step's entry above). Root cause confirmed exactly as
suspected: the shared `asPlayer(client, playerId, fn)` helper always `rollback`s at the end of
every call, so a write made inside one `asPlayer` call was never actually visible to a later,
separate `asPlayer` call or a raw query outside any wrapper. Fixed each affected test by either (a)
reading its own write back inside the same `asPlayer` call — the same read-your-own-write pattern
the `money model row-level security (step 2.1)` block already uses — for "lets a player edit
review-state content fields on their own note", or (b) seeding the committed state directly via the
raw superuser `client` first, the same way the file's own `prize_receivables`/`ledger_lines`
fixtures are seeded, for "refuses a player editing someone else's note" (which genuinely needs to
prove committed-state visibility across two different simulated player sessions, not just within
one). Also split "refuses a player setting status or deleted_at directly" into two separate
`asPlayer` calls: both assertions were sharing one Postgres transaction, so the first rejected query
left it aborted and the second failed with "current transaction is aborted" instead of the
"permission denied" the test was actually checking for. And rewrapped "never allows a SQL DELETE on
notes for any role" inside `asPlayer` — it had been running as the raw `SUPABASE_DB_URL` connection
(the schema owner, not the `authenticated` role), so the delete it meant to prove impossible was
silently succeeding, deleting `noteA` out from under the tests that ran after it. Test-only change;
no schema, RLS policy or grant needed to change. Confirmed live against the real project
(`gpzpmrumwaqyfkyvqbgl`), not just inferred: all 19 tests in `rls.integration.test.ts` (the notes
block's 7, plus every other block including step 2.1's money model block) now pass against
`SUPABASE_DB_URL`.

## Step 2.2 · Financial Agent — 22 September 2026

Read first: PRD-03 (all), decisions worksheet 5, 6, 7.

Built: the deterministic engine lives in `packages/agents/src/financial` — `runway.ts`
(`computeBurnState`, `computeRunwayWeeks`, the fourteen-week `computeProjection` with a cash-only
and a with-pending line, `zeroDate`, `weeksUntilRed`), `pnl.ts` (`computeMonthlyPnl`, structurally
unable to take a pending receivable as an argument at all, which is what makes decisions
worksheet 7's fix "not really a decision" true in code, not just in the PRD), `budget.ts`
(`computeBudgetVsActual`, `computeWeeklyBudgetBar`), `milestone.ts` (`computeMilestone`, integer-
percent stepping to dodge float drift at exact thresholds), and `action-candidates.ts`
(`rankActionCandidates` over three buildable candidates — `update_balance`, `chase_overdue_receivable`,
`trim_weekly_overspend` — with `update_balance` always present so F-18's "exactly one action" holds
even with nothing else to flag). Two agent halves sit alongside: `generate-action.ts` phrases the
winning candidate into the "one thing" sentence (`gpt-4o-mini`, one schema-constrained call, one
corrective retry, the same shape as every prior agent), and `extract-receipt.ts` is a vision-input
sibling of `match-scribe/extract.ts` for receipt scanning, both with mock clients and real OpenAI
clients. `packages/db/src/budgets.ts` adds `createBudgetEstimate`/`listCurrentBudgetEstimates`,
`setWeeklyBudget`, and `snoozeFinancialAction`/`listActiveFinancialActionSnoozes`.

`apps/api/src/financial` runs the scheduled-and-event half on packages/actions' `AGENT_RUN_QUEUE`
(`scheduler.ts` ticks hourly but only fires at the fixed 07:00 UTC hour PRD-03 asks for, no per-
player timezone lookup needed unlike Mindset Coach's own scheduler; `worker.ts` registers it the
same pause/provider-switch/retry-schedule way every prior scheduled agent does). `run.ts` hashes
only the winning candidate's own facts (not the whole input bundle) and reuses the last phrased
action from `agent_runs` when that hash is unchanged, which is the actual mechanism behind PRD-03's
"live runs recompute figures without regenerating the action" — the deterministic KPI numbers
themselves are never cached at all; apps/web recomputes them live, on every read, straight from
`ledger_lines`/`reserve_entries`/`prize_receivables` (`apps/web/lib/financial/load.ts`), the same
"conversion is a view" rule `ledger.ts` already enforces for currency. `receipts.ts` holds the one
real vendor call this step has outside the scheduled run (an OpenAI vision call) behind
`/financial/receipts`; `receivables.ts` and its `/financial/receivables/:id/receive` route are the
one genuinely gated write this step adds — `markReceivableReceived` running on the service-role
client after `apps/web`'s own `confirmApproval` (step 0.6's prepared-but-unused helper, its first
real caller) creates the approval row through the player's session, shown beside a `Confirm`
consequence sentence (M-GATE-2) rather than a second dialog.

`apps/web`'s `/agent/financial` page replaces the step-0.5 placeholder: a KPI row, a hand-drawn SVG
runway chart (`components/financial/runway-chart.tsx`, the same `el`/`tagChartEnter` idiom
`mood-chart.tsx` established) with the "Reserves reach zero / With pending prize / If nothing
changes" tile row underneath, the One Thing card with its milestone progress bar, Budget vs actual,
Reserves (balance update plus the mark-received `Confirm`), this month's P&L, and the Ledger card
(manual entry, a client-driven sequential receipt-scan queue over the synchronous
`/financial/receipts` call — "Receipt 1 of 3", Skip, Cancel, Check badges on low-confidence
fields — and a CSV export). The first-week dashboard's Runway tile
(`components/financial/runway-pulse-tile.tsx`) is now live, matching real reserves/burn once a
balance exists, "Not set up" until then.

Design decisions worth recording: `expense_save` and `balance_update` stay plain RLS-scoped writes
(`insertLedgerLine`, `enterReserveBalance`, both already built in step 2.1) rather than routed
through `runGatedAction` — TECH-ARCHITECTURE section 3's hard actions-module list is exactly
Stripe/Resend/ICS/entry-client plus two named DB transitions, and neither expense saves nor balance
updates are on it; `receivable_received` is the one that is, so it alone goes through the gate. New
migration `20260922090000_step_2_2_financial_agent.sql` adds exactly two tables:
`budget_estimates` (a player's own named trip budgets — F-16's "per estimated tournament" with no
real tournament to reference until step 3.1, so a budget estimate's own row id doubles as
`ledger_lines.tournament_id`, append-only, no update policy, a revision is a new row) and
`financial_action_snoozes` (append-only "Not this week" log, latest row per candidate key wins).
No new column on `players`: `weekly_budget` already exists from step 1.4's onboarding wizard
(default 1,200, the same number PRD-03's own example uses), discovered before writing a duplicate.

Done-when checks: `packages/agents/src/financial/runway.test.ts`'s Arya fixture reproduces PRD-03
F-AC-1 exactly — reserves 9,450, gross spend 1,281, MRR 612 → 8.3 weeks, amber, 1,140/wk net burn,
11% coverage — proving the formula independently of the real production MRR input, which is always
0 until step 4.1's patrons/payouts tables exist (documented inline, the same "not yet" idiom
`mindset-coach`'s `hasMatchToday` stub already established). `pnl.test.ts` reproduces decisions
worksheet 7's fix: September reads 612 in with the Genoa receivable excluded entirely while
pending. `extract-receipt.test.ts` reproduces F-AC-5 and F-AC-6 against the Trattoria da Gino and
Farmacia Centrale fixtures — merchant, amount, currency, category all extracted, one low-confidence
field flagged without blocking Save. The route matches `#/agent/financial`, checked directly
against `docs/procircuit-dashboard-neumayer.html`'s own prototype (see below).

**Verified against the real Supabase project** (`gpzpmrumwaqyfkyvqbgl`), not just fixtures, since
this project can't branch (owner confirmed applying the migration directly): applied
`step_2_2_financial_agent`, ran `get_advisors` (no new findings — both new tables have explicit
`select`/`insert own` policies), hand-verified `database.types.ts` against the migration's own
column list (the MCP type-generation call was blocked by the sandbox's permission classifier;
`tsc --noEmit` across every package confirms the hand-written types match what the code actually
uses). Then did real live browser verification against a real signed-in session
(`manu.dadubey@gmail.com`) rather than deferring it as step 1.4 had to: entered a real balance
update (persisted, `Update your balance` recomputed the KPI row and the chart live), saved a real
manual expense (`Test lunch`, €45 — runway, net burn, the weekly budget bar and the month's P&L all
recomputed correctly and matched the pure-function math by hand), then deleted both test rows
afterward via `execute_sql` once confirmed to be the only rows on that player (nothing pre-existing
was touched). `pnpm typecheck`, `pnpm lint`, `pnpm format` and `pnpm test` are all green — 320
tests passing across every package (98 in `packages/agents` including the new `financial/` suite,
15 in `apps/web` unchanged, 92 in `apps/api` including 18 new `financial/` tests, plus 21 skipped
integration tests unaffected by this step).

**Found and fixed, all this session**: (1) `apps/web`'s own `computeProjection` call never actually
passed `pendingReceivables` in, so the chart's dashed "with pending" line was silently identical to
the cash-only line — found by checking the build against the prototype, not by a test, since
nothing exercised a player with a pending receivable end to end; fixed, and `zeroWeekWithPending`
added to `runway.ts` with its own tests so the "With pending prize" tile has a real number. (2)
`requestFinancialRecompute`'s fire-and-forget call to `apps/api` threw an unhandled promise
rejection whenever the API wasn't reachable (visible as a real Next.js dev-overlay error caught
live in the browser), fixed by catching and logging it as a non-fatal warning, matching what its own
comment already claimed it did. (3) `@procircuit/actions`'s single barrel export unconditionally
pulled `pg-boss` (and so the real `pg` driver — `fs`/`net`/`tls`/`dns`) into `apps/web`'s client
bundle the moment `packages/agents/financial` needed `AgentValidationError`/`TokenUsage` from it,
breaking `next build` outright; fixed by splitting the queue-dependent exports
(`createBoss`/`registerAgentWorker`/`enqueueAgentRun`/`AGENT_RUN_QUEUE`) onto a
`@procircuit/actions/queue` subpath (a new `exports` map in its `package.json`) that only
`apps/api` imports, leaving the main package entry browser-safe. (4) Running `pnpm build` against
`apps/web` while its dev server was live corrupted the dev server's shared `.next` cache (a
production `BUILD_ID` colliding with the dev server's own manifest format), breaking the page for
every session sharing that server; fixed by clearing the cache and restarting the dev server — a
process lesson (don't run a production build against a directory a dev server is actively serving
from) rather than a code bug.

Skipped, deliberately, checked against the prototype and left as real, documented gaps rather than
faked: the scenario tabs (No entry / Poznań lose R1 / reach QF) — genuinely blocked on step 3.2's
Tournament Agent, and PRD-03's own failure-behaviour text ("If no top pick is undecided, the
scenario control collapses to No entry") is what this collapses to, not a deviation; the six-month
P&L chart and the month/season selector — this build shows the current month only; a receipt's
rendition/thumbnail and F-15's card-number redaction — no image-processing dependency exists to do
either safely, so the photo is held in memory for one extraction call and never written to storage
at all (stricter than F-15's letter, not weaker: nothing unredacted is ever persisted, but a scanned
ledger line's receipt-button expansion has nothing to show); patron MRR and payouts — always 0,
step 4.1; F-21's "the agent learns from the gap" cost-prior adjustment — needs the Tournament
Agent's cost model, step 3.2; the Sunday reminder's quiet hours and per-player toggle — step 2.3
(Settings), as step 2.1's entry already flagged. `docs/procircuit-dashboard-neumayer.html`'s own
`#/agent/financial` view was read directly (served over a local static HTTP server, since the
built-in browser only executes JS for `file://` prototypes when served, not opened directly) to
check the build against it field by field; the milestone bar and the three runway summary tiles
were real gaps found this way and fixed, not just noted.

## Step 2.3 · Settings, preferences, sharing — 23 September 2026

Read first: PRD-12 (all), decisions worksheet 4, 12, 13.

Built the nine Settings panes (`apps/web/app/(app)/settings`): a hand-rolled vertical `#stNav`
(no existing component fit; adapted from the onboarding wizard's step-pill idiom) driving nine
pane components under `settings/panes/`. Account (name, read-only email, the existing
`PasskeyRegister`, time zone tied explicitly to the Mindset Coach's run time); Preferences (app
language, home currency, spoken language, units, date format, all `ToggleGroup`s, one Save);
Notifications (a hand-built `Table`-based matrix, five agents × {for_you, fyi} × {in_app, email,
push}, quiet hours, the reserve-reminder toggle); Agents (Mindset/Financial real pause switches
against `agent_schedules`, Tournament/Content shown dimmed with "arrives with step 3.x" rather
than hidden, Sponsor/Fan as static Elite previews); Equipment and most of Connections are honest
stubs (see Skipped, below); Sharing (create/copy/renew/revoke, the scope checklist, wired for
real); Data & safety (audio deletion, export, emergency contact, provider list, the delete-account
danger zone). `packages/db/src/settings.ts` (`updateAccount`, `updatePreferences`,
`updateNotificationPrefs` plus `isNotificationChannelEnabled`/`hasAtLeastOneChannel`,
`setAgentPaused`, `updateEmergencyContact`, `downgradeToFree`) and `sharing.ts`
(`createShareLink`/`listShareLinks`/`revokeShareLink`/`renewShareLink`) hold every plain
RLS-scoped write; all of it is direct client Supabase calls, no apps/api round trip, same split
every prior step's simple-CRUD has used.

The migration (`20260923090000_step_2_3_settings.sql`) adds eleven `players` columns
(`spoken_language`, `date_format`, `quiet_hours_start/end`, `notification_prefs` jsonb,
`emergency_contact`, `reserve_reminder_enabled`, `deletion_confirmation_token/sent_at`,
`export_requested_at/delivered_at`) and finally closes step 0.2's own flagged gap: `players` had
no column-level grant restriction at all until now. `revoke update ... ; grant update (<every
column except the five deletion/export ones>)` — verified safe first against `finishOnboarding`'s
own write list (nothing it touches is excluded), then verified live after applying (queried
`information_schema.column_privileges` directly: `authenticated` has `UPDATE` on
`quiet_hours_start`, not on `deletion_effective_at`). `verification`/`tier` stay player-writable;
locking those down belongs to step 3.1 and the billing step respectively. `approvals.action_type`
gets two additive values, `account_deletion_request` and `data_export_request` — the only two
Settings writes with a real vendor side effect, matching TECH-ARCHITECTURE section 3's hard list.

**The first real Resend integration.** `packages/actions/src/resend-client.ts` is the only file
outside `packages/actions` allowed to `import 'resend'` (the lint rule already covered it); its
`createResendEmailClient` and `account.ts`'s `requestAccountDeletion`/`confirmAccountDeletion`/
`cancelAccountDeletion`/`requestDataExport` live at a new `@procircuit/actions/account` subpath,
not the main barrel, for the exact `pg-boss`-in-the-client-bundle reason step 2.2's own BUILD-LOG
entry already documents — apps/web's client bundle already pulls symbols from the main barrel
transitively, and a real vendor SDK must never ride along. `requestAccountDeletion` and
`requestDataExport` are this step's two `runGatedAction` callers (mirroring `receivables.ts`'s
shape exactly): the player's own tap creates the approval row (`confirmApproval`, prepared since
step 0.6), then `apps/api/src/account/routes.ts`'s `/account/delete/request` and
`/account/export/request` consume it on the service-role client. `confirmAccountDeletion` (sets
`deletion_effective_at` fourteen days out, clears the token) and `cancelAccountDeletion` are not
gated — no vendor call — but only ever run through apps/api, never a path apps/web could call
directly, which is what actually keeps `deletion_effective_at` closed off in practice on top of
the column-grant lockdown. `apps/web/app/account/delete/confirm` mirrors `auth/confirm` exactly
(a GET-only page behind a server-action form, never auto-confirming on load, for the same
link-scanner-safety reason that page's own comment gives).

**The other new architectural piece: `apps/api/src/sharing`.** `GET /sharing/:token` is the only
fully unauthenticated route in the whole API besides `/health` — a coach or manager visitor has
no Supabase session, so the token is the only credential there is. `service.ts`'s
`resolveShareLink` checks `revoked`/`expires_at` fresh on every single request (nothing cached,
which is what actually makes ST-15's one-minute revocation bound trivially true — the very next
request already fails), bumps `open_count`/`last_opened_at`, then branches to a scope-specific
DTO built by hand, field by field, never a row spread: `CoachViewData` (recent `coach_share`
match notes — result, opponent, tags, summary, never transcript/audio/mood — plus non-dismissed,
`coach_share` patterns; Tournament shortlist and Conditions sections read as honest "not
available yet," matching steps 3.2/3.3 not existing) and `ManagerViewData` (runway/burn/reserves/
P&L/expenses, reusing `packages/agents/src/financial`'s pure functions directly rather than
apps/web's own `load.ts`, since that file lives in apps/web and computes several fields PRD-12
explicitly excludes from the manager scope — the budget bar, milestone, the "one thing" sentence,
all "agent outputs"). `apps/web/app/(bare)/coach/[token]/page.tsx` replaces the step-0.5 stub with
a server-fetched (no CORS, no client bundle) render of whichever DTO comes back, or the generic
"isn't valid or has expired" for a 404.

`apps/api/src/reserves/scheduler.ts` gained `isWithinQuietHours`/`effectiveReminderTarget`
(handles a quiet window that wraps midnight, and shifts the held delivery to the next calendar
day when it does) and `listReminderEligiblePlayers` now reads `reserve_reminder_enabled` — closing
the follow-up both step 2.1 and step 2.2 flagged by name. `apps/api/src/notes/audio-lifecycle.ts`
gained `deleteAllAudioForPlayer` (ST-18's "Delete all audio now," cause `player_delete`, same
table the 7-day sweep already writes `cause: 'expired'` to) behind a new
`POST /notes/audio/delete-all` route. `apps/api/src/account/scheduler.ts`'s `sweepDueDeletions`
is the finalising half of the fourteen-day cooling-off — audio deleted first, then
`auth.admin.deleteUser` cascades through every FK'd table (confirmed by reading every migration:
all `on delete cascade` from `players` except `admin_actions.player_id`, which has no cascade or
set-null behaviour at all, a real gap flagged for step 5.1 to resolve since `admin_actions` has to
survive deletion for M-GATE-4, arguing against cascade there specifically) — unit-tested against
fakes only, never run against the real project this session.

Done-when checks (the build plan's own three): revoking a share link fails the next request
immediately (well inside the one-minute bound — verified live, see below); the delete flow sets
`deletion_effective_at` fourteen days out and Cancel clears it (verified live); the export job
produces `data.json`, `expenses.csv`, `notes.csv` and `transcripts.txt` (verified live, with a
real email actually sent).

**Verified against the real Supabase project** (`gpzpmrumwaqyfkyvqbgl`), migration applied directly
(owner confirmed first, same as every prior step): `get_advisors` afterward showed no new
findings, `database.types.ts` regenerated and reformatted to match house style. New RLS
integration tests run live: `authenticated` can update `quiet_hours_start` on their own row but is
refused on `deletion_effective_at` (`permission denied`, the column-grant lockdown actually
holds), and a direct `anon`-role select on `share_links` returns zero rows (RLS with no `anon`
policy, not a permission error — confirmed `anon` does hold the table-level grant, so this is
genuinely RLS filtering, not a lucky accident of a missing grant). `pnpm typecheck`, `pnpm lint`
and `pnpm format` are clean across all nine packages; 381 tests pass without a live DB connection
(6 `packages/shared`, 3 `packages/ui`, 84 `packages/db`, 52 `packages/actions`, 98
`packages/agents`, 123 `apps/api`, 15 `apps/web`) plus all 21 `packages/db` RLS blocks passing
live (402 total), plus 14 `e2e` Playwright tests including three new ones for the coach/account-
delete-confirm bare routes.

Then real live browser verification against the real signed-in session
(`manu.dadubey@gmail.com`), not deferred: walked all nine Settings panes: changed home currency to
CNY and back (persisted both ways, `Saved` toast); the Notifications matrix, Agents pane (correctly
read Mindset Coach as paused, Financial as active, from the real `agent_schedules` rows) and
Connections all rendered real data. Sharing: created a real coach link (`expires 22 Dec 2026`,
correct scope strip), opened `/coach/<token>` in a second tab (real match results and the correct
"Never money, never mood-by-date" copy), confirmed `open_count` incremented in the database,
revoked it from Settings, confirmed the same URL immediately started returning "isn't valid or has
expired." Created a real manager link the same way; the `/coach/<token>` manager view is what
surfaced this step's one genuine bug (below), then verified clean and revoked. Data & safety: a
real Export request (below), then the full delete-account cycle — "Delete account" → emailed
confirm link → opened it → `deletion_effective_at` set to exactly fourteen days out, Settings
showed "Scheduled" with the real date → Cancel → confirmed cleared in the database. The account
was left in a clean, untouched state afterward (currency reverted, both test share links revoked,
deletion cancelled); "Delete all audio now" was deliberately not fired against the real account
live (real, possibly-unconfirmed audio would be genuinely and irreversibly deleted) — it is fully
covered by unit and route tests instead.

**Found and fixed, all this session**: (1) `computeRunwayWeeks` returns `Infinity` for a zero net
burn, and `JSON.stringify` silently turns `Infinity` into `null` — the manager coach view crashed
live (`Cannot read properties of null (reading 'toFixed')`) the first time a real player with no
ledger lines opened it. Fixed by converting `Infinity` to an explicit `null` server-side
(`ManagerViewData.runwayWeeks: number | null`) and checking for `null` client-side instead of
`Infinity`, with a regression test asserting the real JSON-round-tripped value. (2) Resend refused
the export email outright the first time it ran against a real account with zero expenses yet:
`toCsv` returned an empty string for zero rows, and Resend's attachment validation treats an
empty-string `content` as missing entirely ("must have either a `content` or `path`"). Fixed by
passing CSV headers explicitly rather than inferring them from `rows[0]`, so a header-only CSV is
always non-empty. (3) The real `RESEND_API_KEY` this session's owner supplied sends from an
unverified `procircuit.app` domain, which Resend refuses with a 403 — switched the default sender
to Resend's own sandbox address (`onboarding@resend.dev`, no verification needed) behind a new
optional `RESEND_FROM_ADDRESS` env var, so the real domain can be swapped in the moment it's
verified. (4) A fourth `pg-boss` instance (this step's own, for the deletion sweep) tipped the
session pooler's 15-client cap over (`EMAXCONNSESSION` on startup, live, this session) —
apps/api already runs three boss instances (notes, actions, money); fixed by adding the sweep's
queue to the existing `money` boss instead of a fourth instance, and documented the connection
budget explicitly in both files so a future step doesn't repeat it.

Skipped, deliberately: real Stripe Billing (no subscription object exists yet — Plan & billing
reads real `tier`/`billing_cycle` but the card-on-file and invoice history are honest empty
states, and "Downgrade to Free" applies immediately rather than at a real period end, flagged
inline in `settings.ts`); Equipment pane content (build-plan step 3.3's own job, per its "Build:"
line and PRD-12 §4.7's "referenced not duplicated"); most of Connections (ATP, ITF, Stripe Connect
Express, Resend-for-patron-email, calendar feed — none has a genuine per-player connection yet,
each pane row says exactly which step lands it); the six-step tour walkthrough (still disabled,
unrelated to this step); direct coach accounts (M-SHARE-4, Release 2 per PRD-00 section 8); custom
share-link scopes beyond the fixed coach/manager sets. Two PRD-vs-schema inconsistencies resolved
in code, not silently picked: patron-update language stayed singular (decisions worksheet 9
already superseded PRD-12 §4.3's multi-select prose; the schema was already built singular) and
the notification matrix used the two-category For-you/FYI shape (decisions worksheet 13), not the
per-event matrix the prototype shows.

[PR #12](https://github.com/manudadubey/ProCircuit/pull/12) is open.
