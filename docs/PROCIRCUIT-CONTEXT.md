# ProCircuit prototype: project context

Last updated 12 September 2026. This file is the single source of truth for the ProCircuit clickable prototype. It is written so that a person or an agent picking the project up cold can understand what exists, why it exists, how it is built, what has been decided and reverted, and what the traps are. Read it fully before editing any of the three HTML files.

Owner: Manu Dubey (subscriptions@jbgroupinternational.com.au). Writing rule that applies to everything produced for this project, including code comments and UI copy: never use an em dash. Use commas, colons, parentheses, en dashes or separate sentences. Australian English spelling (colour, organise, kilometre).

---

## 1. What ProCircuit is

ProCircuit is an agentic SaaS for professional tennis players ranked on the ATP and ITF tours, roughly the #150 to #1500 band where a player runs their career as a small business with almost no staff. The product is a set of agents that do the administrative and analytical work around the tennis: choose tournaments by cost-to-prize, keep the books and runway, run a patron (paid supporter) programme, draft content, coach mindset from voice notes, and brief the player on conditions and equipment. The player captures with their voice and phone camera; the agents wait for approval before anything leaves the app.

The requirements came from an uploaded architecture document (`procircuit-arch-merged.html`, in the uploads folder). Directive from the owner: take no visual style from that document. The prototype uses only the shadcn preset below.

### Commercial model (aligned to the architecture doc)

Three tiers, priced in Australian dollars, 14-day trial with no card.

Free: ranking tracking and the dashboard, Match Scribe with limits, public profile.

Pro: A$49 a month or A$39 a month billed annually. All agents except the Studio agents. 8 percent platform fee on patron income. Cap of 50 patrons.

Elite: A$149 a month or A$119 a month billed annually. 5 percent patron fee, no patron cap, TimesFM ranking forecasts, early access to Sponsor Agent and Fan Agent (the "Studio" agents), Agent Studio.

Scope note (13 Sep, register A21): WTA players are in Release 1 with the same stage thresholds; doubles ranking and doubles prize money are in Release 1, doubles draws and partners are Release 2. The Berger file is the WTA persona (section 2); Arya and Neumayer remain ATP. No surface should hard-code "ATP" in new work.

Ranking intelligence stages, detected from the verified ranking and used to decide what the dashboard leads with: Stage 1 (ITF-led, ATP number absent or above roughly 800), Stage 2 "Emerging" (ATP roughly 450 to 800, ATP number leads, ITF shown as a chip, WTN and UTR hidden), Stage 3 "Established" (inside roughly 450, ATP only, Challenger-first shortlist).

### Decisions taken in discussion (not all are built)

Baseline forecast (TimesFM) belongs in Elite, framed as "where you land if you play the calendar you have chosen" rather than a prediction to bet on. A top-100 variant was discussed and parked: those players have teams and different needs. A "Team pack" add-on and a wider packs system were built and then reverted at the owner's request ("revert the last change"); a backup of that build is at `/tmp/backup_packs.html` in the sandbox, which does not survive the session. Bank connection was rejected ("not sure connecting to bank is good idea"); reserves are entered by the player with a Sunday reminder instead. Fuel (menu scanning) was scoped as hotel and restaurant menu photographs, not a general diet agent. The Conditions and equipment layer came from the China story: Arya struggled with first serves in heat and humidity at an M25 in Anning without changing string tension.

---

## 2. Deliverables

All three files are single-file HTML (all CSS and JS inline, images as data URIs) written for the claude.ai Artifact publisher, which wraps the file in its own doctype, head and body. The files therefore contain no `<!doctype>`, `<html>`, `<head>` or `<body>` tags; the first lines are `<title>` and `<style>`.

| File | Player | Purpose | Published URL |
|---|---|---|---|
| `procircuit-dashboard.html` (~571 KB) | Arya Dubey (fictional) | The master prototype. Every feature lands here first. v0.3 on 13 Sep applied the decisions (see section 12). | Original: https://claude.ai/code/artifact/ebb06c18-5fce-47de-a9d2-2340dac4426e (in another organisation, cannot be updated from the current one) · Current: https://claude.ai/code/artifact/547daadb-8b60-4957-adf6-eed3955dead9 |
| `procircuit-dashboard-neumayer.html` (~429 KB) | Lukas Neumayer (real, AUT, #227) | Full copy at feature parity, showing a Stage 3 player with a fully loaded season. v0.3 on 13 Sep. | Original: https://claude.ai/code/artifact/45ab2242-0f09-4010-9116-1ffcfd2573f3 (other organisation) · Current: https://claude.ai/code/artifact/ab8789b3-f8a2-4a8b-9038-2c18018bdc4b |
| `procircuit-dashboard-berger.html` (~552 KB) | Sofia Berger (fictional, GER, WTA #512, doubles #276, ITF #241, Stage 2) | The WTA Stage 2 persona, ported from the Arya file on 13 Sep (script `wta_port.py` in the session): tour-aware labels (WTA everywhere ATP was), women's events (W35, W50, W75, W100, WTA 125 in place of M25 and Challenger tiers), a Doubles chip on the hero and public profile, a doubles prize row in the Financial Agent (W75 Genoa doubles SF, her half, pending in euro), initials in place of a photo, German cities and flags, coach Julia and parent Bernd B., storage keys `pc.sb.*`. Same routes and features as Arya otherwise. Use for every WTA research participant. | https://claude.ai/code/artifact/a7b2d6d2-1ecb-44e8-b9ea-be7c911c2055 |
| `procircuit-architecture.html` (~45 KB) | none (reference page) | System architecture and tech stack page built 13 Sep from TECH-ARCHITECTURE v0.3: stack at a glance with alternatives weighed, system diagram, approval-gate diagram, money-model diagram, data model by group, integrations with failure modes, repo layout, environments and pipeline, security, observability, unit economics chart, running-cost estimate, build plan with critical path, team shape, ranked risks. Same tokens and fonts as the prototypes; no script. | https://claude.ai/code/artifact/7c1b828b-792c-4398-906c-6baa4d21a4aa |
| `procircuit-baseline.html` (~118 KB) | none (design system) | Baseline, the ProCircuit design system v1.0, built 13 Sep from the prototypes and the shadcn Vega preset: principles, colour (swatches read the live tokens and follow the theme toggle), type scale, spacing, radius, elevation, motion, icons and flags, every component rendered live from the prototype CSS, the five product patterns (three answers, decision card, approval gate with the consequence-sentence table, locked surfaces, shells), voice and copy rules, accessibility, and a paste-ready tokens.css plus Tailwind theme mapping. Section 3 of this doc remains the measured source; Baseline is the rule book. v1.1 (13 Sep, after an Apple-design review): Motion section rewritten as a surface-by-surface table with spring values (damping and response), velocity handoff and momentum projection for sheets, rubber-banding for scroll edges, and interruptibility rules; reduced motion now keeps opacity and colour fades (150ms) and only stops movement instead of removing all feedback; prefers-contrast: more replaces hairline rings with a foreground ring; theme changes ease over 200ms; mobile hit targets raised to 44px for buttons, switches, checkboxes, tabs and toggle groups; size-specific tracking and leading written out; confirm steps stated as reserved for actions the outside world cannot undo; rem sizing noted as a build rule the prototypes do not yet meet. The reduced-motion, contrast, theme-ease and 44px rules are in the shared base.css and applied to the admin console (v0.2.4); the three player files still carry the old global reduced-motion rule and 40px minimum and should pick these up on their next port. | https://claude.ai/code/artifact/475ff78e-486c-44bf-9217-f3b451d0fcba |
| `procircuit-team-sinner.html` (~132 KB) | Jannik Sinner (real) | Standalone Team dashboard: how a coaching team would use the product around a top player. | Original: https://claude.ai/code/artifact/39a4373f-1e1a-4df5-bf8c-ecc886a71ba0 (other organisation) · Current: https://claude.ai/code/artifact/11dc16a4-9c3b-47e2-8beb-32952933ad16 (published 13 Sep with the crumb removal) |
| `procircuit-admin.html` (~152 KB) | Platform admin (Manu Dubey as owner) | Operations console v0.1, built 13 Sep on the Neumayer shell: Overview, Players (support lookup, account actions, audit log, delete with cooling-off), Agent health (runs, approval rate, failures, kill switches), Ingestion (feed status, ranking CSV import, fact-sheet corrections, missing deadlines), Money (MRR, fees, cost to serve, waitlists, payouts), Trust and safety (cases, data requests, real-person governance). v0.2.2 (13 Sep): A18 to A20 settled (separate hostname, no impersonation, model spend visible to all roles). v0.2 (13 Sep, after review): every account action is a two-step confirm with a consequence sentence, trial extension and comps require a reason; model spend per player is owner-only (A20); distress case has no Dismiss and shows its escalation rule; fee basis stated on Money (B22); as-of line on Overview; real routes `#/audit` (admin log) and `#/routing` (alert routing by role, on-call); Overview badge counts attention rows (B23); email dropped from the Players table so it fits at 1440; eighth feed card (Resend events); runs-per-hour chart on a square-root scale. Role preview (owner, ops, support) hides areas. Storage key `pc.admin.sidebar`. Specified in PRD-13 (written 13 Sep); PRD-00 v0.2 adds the staff actor, M-SHARE-5 and the staff extension of M-GATE-4; review register v0.2 adds A18 to A20 and B22, B23. | https://claude.ai/code/artifact/3a1aa53f-9d37-438f-8c4f-ae0cac118d70 |

Working copies live in the session outputs folder. Publishing: call Artifact with the file path and the URL above. Both player files carry the same hash-routing shell, so edits made to Arya usually need to be ported to Neumayer (see section 10 for how the last port was done).

The Team Sinner file's crumb removal is published at the Current URL (13 Sep).

---

## 3. Design system

The design system is named Baseline and documented as a live page (`procircuit-baseline.html`, section 2). The tokens and recipes below are what it was measured from.

### Preset

shadcn/ui preset `b3REZz9P6` (https://ui.shadcn.com/create?preset=b3REZz9P6): style Vega, base colour Neutral, chart palette Lime, font Geist (with Geist Mono for numbers), Lucide icons, radius 0.625rem, Base UI primitives. Tokens were captured from the live preview iframe rather than guessed. Fonts load from Google Fonts (Geist, Geist Mono); everything else is inline.

### Tokens

Light `:root` and dark palettes are both defined; dark is applied by `@media (prefers-color-scheme: dark)` guarded with `:root:not([data-theme="light"])`, and again by `:root[data-theme="dark"]` so the in-app theme toggle wins in both directions. Key values:

Radius: `--radius: 0.625rem`, with sm (−4px), md (−2px), lg (= radius), xl (+4px). Cards use xl (14px).

Neutral scale (light): background #fff, foreground oklch(0.145 0 0), card #fff, primary oklch(0.205 0 0), secondary and muted oklch(0.97 0 0), muted-foreground oklch(0.556 0 0), border and input oklch(0.922 0 0), ring oklch(0.708 0 0), sidebar oklch(0.985 0 0), surface #f8f8f8, field oklch(0 0 0 / 3%).

Dark: background oklch(0.145 0 0), foreground oklch(0.985 0 0), card oklch(0.205 0 0), primary oklch(0.922 0 0), secondary and muted oklch(0.269 0 0), muted-foreground oklch(0.708 0 0), border oklch(1 0 0 / 10%), field oklch(1 0 0 / 4.5%).

Chart lime (dark values): chart-1 oklch(0.897 0.196 126.665), chart-2 oklch(0.768 0.233 130.85), chart-3 oklch(0.648 0.2 131.684), chart-4 oklch(0.532 0.157 131.589), chart-5 oklch(0.453 0.124 130.933). Light shifts one step darker. `--chart-grid` is a 6 percent hairline.

Semantic status tokens kept separate from the lime accent so lime always means "data", never "good": `--ok` green oklch(0.627 0.194 149.214), `--warn` amber oklch(0.666 0.179 58.318), `--danger` red oklch(0.577 0.245 27.325), each with a 10 to 14 percent `-bg` variant.

### Component recipes (measured from the Vega preview)

Card: radius 14px, no border, `box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgba(0,0,0,.05)`, padding 24px vertical with children padded 24px horizontal, title 16px/500, description 14px muted. Button: 36px tall, radius 8px, weight 500; outline variant uses `--field` background and `--input` border; ghost has no background; sm is 32px. Badge: 20px pill, 12px text, variants ok/warn/lime/secondary. Tabs: list on muted background radius 10 padding 3, active trigger has field background, input border and a soft shadow. Toggle group (`.tg`): 36px items, secondary background, input border, radius 8, `aria-pressed` drives state. Segmented control (`.seg`, used for kg/lb): same idiom with `aria-selected`. Textarea and Select: field background, radius 8. Item (`.item`): secondary at 50 percent, radius 8, padding 14/16. Table: th 13px muted, td 8px, hairline rows. Progress 6px. Switch, Spinner, Empty state, Field/Label 14px/500 all follow the preview.

### Apple design principles applied

Pointer-down feedback on every pressable (`:active` scale 0.98, 120ms `cubic-bezier(.2,.8,.2,1)`). Translucent chrome (topbar, mobile tab bar, sheets) with `backdrop-filter`, content scrolling underneath. Sheets are anchored (notifications from the right, quick actions from the bottom, user menu opens upward from the footer). Spring-like transitions, `scroll-margin-top` on anchored sections, and both `prefers-reduced-motion` and `prefers-reduced-transparency` respected. Restraint: one accent, numbers in Geist Mono, status by colour token only.

### Flags

Country flags are an inline SVG sprite (`<symbol id="f-AUT" viewBox="0 0 3 2">` and so on, defined next to the logo symbol), used as `<svg class="fl"><use href="#f-POL"/></svg>`. 15×10px, radius 2, hairline inset shadow; 13×9 inside badges and pills. Emoji flags were tried and rejected: no emoji font in headless test environments, letter-pair fallback on some Windows Chrome installs, and the wide glyphs broke line wrapping. Simplified designs exist for AUT, POL, ROU, SVK, POR, TUR, ITA, CZE, CHN, AUS, SUI, GER, ESP, USA, FRA. In JS, `fl(cc)` returns the markup and `pflag(text)` looks up a place name (Poznań, Sibiu, Cluj, Bratislava, Lisboa/Lisbon, Antalya, Genoa, Biella, Vicenza, Bolzano, Liberec, Anning, Vienna/VIE, Graz, Linz, Salzburg, Innsbruck, Klagenfurt, Radstadt, Melbourne, Zurich). Flags appear on: player identity (hero, sidebar footer, public profile, coach hero), tournament shortlist and detail, dashboard decision chips, coach agenda and results, Match Scribe result lines, prize and estimate tables, patron cities, Fuel cities, and the currency selector. Not in the country `<select>` (option lists cannot hold SVG and flags in dropdowns are poor practice). Languages never get flags.

### Logo

`ProCircuit.svg` (uploads) is inlined as `<symbol id="logo" viewBox="0 0 193 202">` and used in the sidebar header at 30px, the sign-in page and the onboarding header. It was removed from the topbar breadcrumb on 12 Sep ("remove this from all the files"): the topbar now starts with the page title.

---

## 4. Architecture of a player file

### 4.1 File layout (top to bottom)

`<title>`, one `<style>` block organised by `/* ── Section ── */` comments in this order: preset tokens, Shell, Vega primitives, Pulse tiles, Ranking hero, Grid, Tournament shortlist, Financial, Patron, Agent cards, FAB, Decision card, Routes / page header, Vega form primitives, Match Scribe, Vega table / select / empty, Receipt scanning, Budget vs actual and reserves source, Fans, Content Agent, Mindset Coach, Onboarding, Sidebar collapse, Public profile editor, Settings, Studio previews, Tooltip, Walkthrough, Quick actions sheet, Fuel, Notification rail, Coach view, User menu, Sign in, Conditions, Country flags, Mobile bottom tab bar, Theme toggle, Toast, 52-week ranking chart.

Then markup: hidden SVG sprite (flags, logo), `.shell` grid containing `<aside>` sidebar and the main column (topbar, one `<main class="content" data-route="…">` per route, all but the active one `hidden`), then `.tabbar`, FAB, quick-actions sheet `#qa`, notification sheet `#nt`, walkthrough overlay, tooltip `#tip`, toast `#toast`.

Then one `<script>` IIFE organised by `/* ── Section ── */`: Router, Country flags, Tournament Agent, Tension unit, Match Scribe, Financial Agent, Fans, Content Agent, Mindset Coach, Onboarding, Sidebar collapse, Public profile, Settings, Tooltips, Walkthrough, Quick actions, Fuel, Notification rail, Coach view, User menu and sign out, Preferences (currency and language engines), Mood check-in, FAB recorder, Boot.

Boot is the last line of the IIFE: `applyUnit(); route(); applyPrefs();`. It must stay last because everything above it uses `const` declarations that would otherwise be in their temporal dead zone.

### 4.2 Shell and routing

`.shell` is a CSS grid of 256px sidebar plus 1fr. `.collapsed` (shadcn Sidebar `collapsible="icon"`, toggled by the rail button or Cmd/Ctrl+B, persisted) narrows the sidebar to 48px and the content max-width grows from 1400px to 1600px so the space is actually used. `.bare` hides sidebar and topbar for onboarding and sign-in. Under 1180px the sidebar hides and the translucent bottom `.tabbar` appears (Home, Scribe, Fans, Agents, More); a floating action button opens the quick-actions sheet (Record a note, Scan a menu, Scan a receipt).

Routing is hash based. `routes` maps path to crumb (and optional description for the "coming soon" fallback). `route()` reads `location.hash`, shows the matching `<main data-route>`, sets the crumb and active nav, scrolls to top, and calls per-route draw functions. Unknown paths render the `soon` page. If `pc.state === 'first'`, the dashboard path renders the `first-week` main instead.

Routes: `#/` dashboard, `#/first-week`, `#/agent/tournament`, `#/match-scribe`, `#/agent/financial`, `#/fans`, `#/agent/content`, `#/agent/mindset`, `#/fuel`, `#/onboarding`, `#/profile`, `#/settings`, `#/agent/sponsor`, `#/agent/fan`, `#/coach`, `#/signin`, plus `soon`.

### 4.3 Chrome

Topbar: sidebar trigger, page title crumb (`#crumb`), date chip "Sat 12 Sep · Week 37", then Share with coach (copies coach link, previews `#/coach`), Take the tour icon (`#tourLink`), bell with unread count (`#bell`, `#bellN`), theme toggle. Sidebar footer: user button (photo or initials, name, "ATP 487 · flag AUT") opening `#umenu` upward with Public profile, Settings, Replay setup, Sign out (goes to `#/signin`; `#siGo` returns). Footer links "First-week view" and "Replay onboarding" were removed at the owner's request; those states are reachable from the user menu and Settings.

Walkthrough (`.walk`, four-rectangle scrim, 6 steps: Your ranking verified, Three questions every morning, Entering a tournament is a budget decision, Agents wait for you, Capture from anywhere, Everything else lives here) shows once (`pc.tour`) and from the topbar icon. Tooltips: any `[data-tip]` element feeds `#tip`; the FAB tour target check uses `getClientRects().length` because a fixed element has no `offsetParent`.

Notification rail `#nt` (shadcn Sheet, right side) lists `NOTES` grouped by day with "For you" and "FYI" filters, a Mark all read, and a link to Settings > Notifications. Items include Poznań entry closes in 6 days, Draft ready, morning insight, Runway 8.3 weeks amber, patron joins and leaves, note transcribed, payout sent A$551, weekly shortlist ready.

### 4.4 Charts

Chart enter motion (14 Sep, all five files): a shared block (`chart-motion.css` and `chart-motion.js` in the session, appended to each file) watches every chart host (`.chart` or an id ending in `Chart`) with a MutationObserver and, when a fresh `<svg>` lands, tags marks: stroke-only paths and polylines get `pathLength=1` and draw in over 600ms; filled paths and polygons fade in after 250ms; bar rects (fill from a token, width under 80) grow from the baseline over 400ms with a 25ms stagger; circles fade in; axes, grid, lines and text never move. A resize redraw (viewBox width changed on an already-animated host) does not animate; a data change at the same width and a route revisit do. HTML meters, progress bars, shortlist ratio bars and sparklines grow from their origin on route entry via keyframes on `main[data-route]:not([hidden])`. Curve `cubic-bezier(0.23, 1, 0.32, 1)`; under reduced motion every one becomes a 200ms fade. The same rules are written into Baseline's Charts section.

All charts are hand-drawn SVG through an `el(tag, attrs, text)` helper, redrawn on `ResizeObserver`. Gradient ids are suffixed by host id (`gArea_<hostId>`) so several charts can coexist. Chart y-axes that show money go through `axisK(v)`, which converts AUD tick values into the display currency (section 5.14).

### 4.5 Persistence

Arya file keys: `pc.tour` (seen), `pc.state` (first | full), `pc.sidebar` (collapsed), `pc.unit` (kg | lb), `pc.prefs` (JSON `{lang, cur, units}`). Neumayer file uses the same names under `pc.ln.*` so both prototypes can be open in the same browser without sharing state. Everything else is in-memory.

---

## 5. Section-by-section specification

### 5.1 Dashboard (`#/`)

Ordered by importance after a "three answers" simplification. First: the ranking hero with player photo (Arya) or initials (real players), "ATP singles ranking" label with the Stage badge, big rank, weekly movement and points, chips (ITF rank, points to defend in N weeks or career high), and the 52-week trajectory chart with annotated wins and defence weeks, today marker, and a dashed projection to end of year. Second: three pulse tiles answering the morning questions: Runway (weeks, amber under 10, reserves and burn, bar), Decision required (days to the next entry deadline), Patrons since last login (joins and churn with a 12-week bar strip). Third: the decision card "This week's decision · Challenger Poznań" with flag and fact chips, the Conditions chip ("17–22°C · Dunlop Fort · keep 24/23 kg"), cost to go, outcomes by round, net outcome range rail, runway if you lose R1 and if you reach QF, Accept entry and Withdraw. Below: agent status cards, latest Match Scribe note, patron movement, mood row.

### 5.2 First-week state (`#/first-week`)

The dashboard as a new user sees it: verified ranking chart, "Your first week" checklist (record a note, log a week of expenses, publish a patron page), sample agent outputs, and a way back to the full state. Toggled by `pc.state`.

### 5.3 Tournament Agent (`#/agent/tournament`)

KPI row (events scanned 17, shortlisted 5, deadline this week, decisions 0 of 5), Shortlist / Calendar tabs, shortlist `#tlist` of five `T` entries ranked by cost-to-prize ratio with a bar and a status badge (Decide within 10 days, Pending, Entered, Skipped), a detail panel `#tdetail` with header (flag, city, tier, surface, dates), chips (week, acceptance status, points defended), the agent's "why" paragraph, cost breakdown (flights with route, accommodation for N nights, coach block, entry fee), outcomes table by round, the Conditions brief (air, court, ball, frames to bring, then the racquet visual and tension test), net outcome rail, and the footer (Accept entry opens a confirm step that logs the planned expense and states runway after an R1 loss; Skip; Withdraw; Undo). Also considered: 12 excluded. A recommendation memo card (timestamped, "GPT-4o, structured output validated with Zod") narrates the shortlist. Budget A$1,200/wk and Blocked dates (coach block in Vienna) are shown top right.

`T` entry fields: id, rk, name, tier, surface, city, dates, wk, dlWk, deadline, days, ratio, flights, stay, coach, entry, nights, route, defend, rounds [[label, prize, points]…], exp, lo, hi, cut, cond {temp, rh, wind, alt, ball, io, diff, tension (0|1), tensionNote, frames, grip, practice}, why.

Arya shortlist: Challenger Poznań (CH 75, clay, POL, 28 Sep to 4 Oct, deadline Thu 18 Sep, direct acceptance), M25 Sibiu (ROU, defends 20 points from last year's final), Challenger Bratislava (CH 100, indoor hard, SVK, qualifying likely, defends 10), Challenger Lisboa (CH 75, hard, POR, alternate list, cut #480 and Arya is #487), M25 Antalya (TUR, filler week, deep field). Neumayer shortlist: same cities but Challenger-tiered (Sibiu Open CH 75, Bratislava CH 125, "CH 50 Biella" in ITA in place of Antalya).

### 5.4 Conditions and equipment layer

Cross-cutting. In the tournament detail a Conditions brief (forecast for match days, refreshed the day before travel) shows air (amber at 28°C or above), court and altitude, ball (amber when it differs from the practice ball), frames to bring and grip advice, then a racquet SVG (`.rq`, clipPath `rqHeadT`, mains in chart-2 and crosses in chart-4) with a legend of mains and crosses tension and a two-frame test: Frame A baseline 24/23 and Frame B the proposed test (25/24 when `tension: 1`), the recommended one outlined in lime. Copy makes the boundary clear: "You and your stringer decide; the brief only proposes the test." Match Scribe notes carry `cond: ['33°C','82% RH','outdoor hard','Head Tour']` rendered as `.stamp` chips, amber when 28°C or 70 percent humidity is reached. The Mindset Coach has a physical pattern (`phys: true`, badge "Conditions", link "See the tension test") built from those stamps. Settings > Equipment holds the profile (frame, string, tension, frames carried, restring cadence, overgrip, practice balls) and a switch to stamp notes with conditions.

Unit toggle: `unit` (kg | lb) persisted; `toU(kg)` converts (×2.2046, rounded), `convT(text)` rewrites "24/23" patterns and the words "a kilo" / "one-kilo" inside prose; `applyUnit()` updates `[data-kg]`, `[data-kgp]`, `[data-kgd]`, `#tensionIn`, `#tensionUnit`. `setUnit(u)` also syncs the Preferences Units toggle. The segmented control lives in Settings > Equipment and an inline "show in lb" link sits in the tournament detail.

### 5.5 Match Scribe (`#/match-scribe`)

The capture surface. Recorder card with context group (Match, Practice, Travel, Other), a waveform `#wave`, progress and hint, then review: transcript (editable), mood group, match fields (result, opponent), tags, "share summary with coach" switch, a Conditions field that is attached automatically, Save / Re-record / Discard. Pipeline description (Whisper transcription, then structured extraction). History with filters and search, mood strip, and entries showing context, result line with flag, mood, tags, duration, which agents used the note, condition stamps, and the transcript. The FAB and tab bar "Record" jump here and start immediately.

Arya notes (11 since 25 Aug, 25 since March): 11 Sep L 6-4 3-6 6-7(5) Kovalenko Genoa Q2 (24°C, 58% RH); 10 Sep serve block with Marko; 8 Sep W 6-3 6-4 Petrov Q1; 7 Sep travel VIE to Sibiu with a 4h delay; 5 Sep L 4-6 6-7(3) Marek (29°C, 71%); 4 Sep points play; 1 Sep W 7-5 6-2 Castro; 28 Aug L 3-6 4-6; 25 Aug return drills; 14 Aug L 3-6 4-6 Zhou, M25 Anning R1 (33°C, 82% RH, first serve 48 percent); 12 Aug indoor serve block in Anning (21°C, 50%). Neumayer notes use anonymised opponents ("Opponent K.") and roles rather than names.

### 5.6 Financial Agent (`#/agent/financial`)

KPIs: Runway 8.3 weeks (amber under 10) with bar, Reserves A$9,450 with A$1,140/wk net burn, September so far (in and out), Patron MRR A$612 (+A$98) covering 11 percent of weekly spend. Reserves and runway chart with scenario tabs (No entry, Poznań lose R1, Poznań reach QF) linked to the Tournament Agent shortlist, dashed cash-only and with-pending-prize projections, 10-week and 4-week threshold bands, and three outcome tiles (reserves reach zero in week 45, with pending prize 9.1 weeks, if nothing changes 4.3 weeks). "One thing to do this week" card (07:00 UTC run): publish the patron update before Poznań, and a next-milestone bar (MRR covers 15 percent of spend). Monthly P&L chart, ledger `X` with categories and tournament attribution, receipt thumbnails, export, Enter manually, Scan receipt.

Receipt scanning: camera or photo picker, a batch queue with a processing state, extracted fields (merchant, original amount and currency with the locked FX rate, category, tournament, date), uncertain fields flagged, skip / save. `SAMPLES` include Trattoria da Gino Genova €38,50 at 1.651, Farmacia Centrale €14,20.

Budget vs actual `EST` per tournament (agent estimate against actuals, fresh rows highlighted). Reserves source: the player types the balance, with a "remind me Sundays" switch and an explicit statement that no bank is connected. Pending prize: Genoa Q2 cheque A$890 expected 3 Oct, shown in the projection as a separate dashed line.

### 5.7 Fans (`#/fans`)

Tiers `TIERS`: Courtside 8 patrons at A$29, Locker Room 3 at A$65, Inside Track 1 at A$185 (MRR A$612; history 380, 410, 455, 490, 514, 612). 30-day movement chart, MRR chart, patron list `PATRONS` (name, tier, since, months, city with flag, six-update open strip, notes such as "Upgraded after Poznań") with All / Attention / tier filters and search, drafted personal messages for quiet or new patrons, payouts via Stripe Connect Express (gross A$612, fee, net), and the Stripe payout log. Cities are mostly Austrian (Vienna ×5, Graz, Linz, Salzburg, Innsbruck, Klagenfurt) plus Melbourne, Zurich, Bolzano.

### 5.8 Content Agent (`#/agent/content`)

Editor with the draft "Three set points, one lesson" (197 words, built from the 11 Sep note), status, subject, body, recipients by tier, teaser switch for free followers, send time, Approve and publish / Skip. Coach visibility fix. History `CH` with open rates and joins per update ("What Poznań taught me" 83 percent open, 1 upgrade; "Liberec, briefly" skipped with the player's reason). Voice notes about what the agent may and may not say.

### 5.9 Mindset Coach (`#/agent/mindset`)

Daily insight in the player's language, mood check-in (five states) with a 12-week mood chart, focus row, and `PATTERNS`: the physical Conditions pattern first, then "After a tiebreak loss, you write about rushing the second serve" (3 of 4), "The day after travel, you're flat", "You skip writing after wins". Each has evidence dots, confidence badge, Show the notes, and Not a pattern (dismiss with a promise not to raise it again unless it recurs twice).

### 5.10 Fuel (`#/fuel`)

Photograph a menu (hotel restaurant, room service card, supermarket shelf; several pages fine) and get two or three picks for where you are in the week: translated, priced, with what to ask the kitchen. Context strip: time and city, tomorrow's match, dietary constraints (no pork, no allergies), food budget left today (A$34). `PICKS` for the Sibiu hotel sample (Romanian dishes with English gloss, why, and asks). "Where you've eaten" history by city with flags and whether it worked. "What Fuel won't do" card (no calorie counting, no supplements, no medical claims). Photos are read once and deleted.

### 5.11 Onboarding (`#/onboarding`, bare shell, centred)

Four steps: Who's playing (name, ATP or ITF lookup with a verified state), What does this season look like (next tournaments, target, surface, weekly budget), Pick a plan (Free / Pro / Elite with monthly and annual toggle), Start your first agent (Financial or Mindset). Finish lands on the first-week dashboard.

### 5.12 Public profile editor (`#/profile`)

Left: edit form (photo, name, bio, goal, socials, media kit), publish status. Right: live preview of the `/p/` page as patrons and sponsors see it, including tiers and next tournament with flag.

### 5.13 Settings (`#/settings`)

Left nav `#stNav` and nine panes: Account (name, email, time zone Europe/Vienna, country), Preferences (section 5.14), Plan & billing (Pro A$49 renewing 3 October, 12 of 50 patrons, upgrade to Elite, invoices), Notifications (per-agent channels and quiet hours), Agents (schedule per agent, run now, pause), Equipment (section 5.4), Connections (ATP ranking TDI live feed, ITF ranking and calendar, Stripe Connect Express, Resend patron email, Calendar feed, Bank: not connected by design, Match Scribe audio retention, Export everything, Someone to call), Sharing (Coach link: matches, shortlists, patterns, never money; Parent / manager link: runway, P&L, expenses, patrons, no notes), Data & safety.

### 5.14 Preferences (language, currency, units)

App language: English, 中文, Español, as a toggle group. A `DICT` of UI strings per language is applied by walking text nodes; original strings are kept in a `WeakMap` so switching back is exact. The player's own notes, drafts and agent prose are deliberately never translated (the pane says so), and the walker skips `.pub .bio, .draft p, .today, .ex, .memo, .why, .insight`. A `MutationObserver` localises anything rendered later. Translation is keyed on the trimmed text of a whole text node, so keep translatable labels as clean text nodes without inline elements inside them.

Home currency: AUD, USD, CNY (Yuan). Model: everything is stored in the currency it happened in and converted at that day's ECB rate; prize money stays in the paying currency until it lands; patron tiers are priced in the home currency through Stripe. In the prototype, `RATES = {AUD:1, USD:0.66, CNY:4.72}` and `SYM`; the text walker rewrites any `A$1,234` pattern (`moneyRe`, with sign) into the display currency, chart axes go through `axisK`, and switching currency redraws runway, P&L, ranking, fans and MRR charts. Owner asked for exactly these three; EUR was proposed for an Austrian player and not added.

Also: language spoken in Match Scribe (Auto-detect via Whisper, or fixed), patron updates written in (multi-select; the Content Agent drafts one version per language and the Mindset Coach speaks the first one), Units (Metric / Imperial, synced two ways with the kg/lb control), and date and number format. Defaults are meant to come from the country chosen at onboarding.

### 5.15 Studio agents (Elite previews)

Sponsor Agent: pipeline (Head Austria and others), outreach draft (Wilson EU follow-up, in the player's voice from the media kit and the Poznań result), kit compliance, "What a deal like yours is worth" (A$3,000 to A$12,000 plus product per regional deal). Fan Agent: what patrons see, how it speaks, which of the player's answers it may use, with sample fan questions answered by the agent and labelled as such.

### 5.16 Coach view (`#/coach`)

Read-only page for the coach link: player hero, 52-week trajectory, schedule and shortlist agenda (weeks 40 to 45 with flags), patterns from the notes (including the Conditions pattern), recent matches with note summaries. No money anywhere, by the Sharing scope.

### 5.17 Sign in (`#/signin`)

Bare shell, logo, email field, continue button that returns to the dashboard. Reached from the user menu Sign out.

---

## 6. Personas and data

### 6.1 Arya Dubey (fictional, master prototype)

Austrian, 23, right-handed, ATP #487 (+14 this week, 96 points), ITF #212, Stage 2 Emerging, projected about #432 by end of year, 30 points to defend in 8 weeks (Sibiu 20 dropping 9 Oct, Bratislava 10). Pro plan, season 2026, renews 3 October. Coach Marko (coach link opened 4 times this week), parent/manager Gerhard B. Reserves A$9,450, net burn A$1,140/wk, runway 8.3 weeks, MRR A$612 from 12 patrons, pending Genoa Q2 cheque A$890. Recent: Genoa qualifying (W Petrov, L Kovalenko in a third-set breaker), Poznań QF in August (prize A$5,480), Cluj R2, Liberec Q1, Sibiu final in October 2025. The China week (M25 Anning, 14 Aug, 33°C and 82 percent humidity, first serve 48 percent) is the origin story for the Conditions layer. Her photo is an 18 KB JPEG crop stored as a data URI (also at `/tmp/arya.b64` in the sandbox during the session). The name was changed from an earlier placeholder (Tomas Berger) everywhere; do not reintroduce it.

### 6.2 Lukas Neumayer (real player, full prototype copy)

Governance for real people: only public facts (nationality AUT, age 24, home Radstadt, ranking #227 with +3 this week and 241 points, career high #157 in August 2025, Stage 3 Established, projected about #204 by end of year, 65 points to defend in 8 weeks, a Challenger title in Vicenza in the chart annotations). Everything private (money, patrons, notes, moods, equipment) is invented and was originally labelled with a demo banner and a "Demo · illustrative data" header chip. The owner asked for both to be removed, along with the footer links; one "(illustrative)" remains in the Equipment string field. No photo: initials LN. Opponents are anonymised ("Opponent K.", "Opponent P."), coach and family appear as roles rather than names, and no staff activity is fabricated. Storage keys `pc.ln.*`. The Conditions story was adapted: second-serve faults clustering in the hot Genoa weeks (5 Sep 29°C, 28 Aug 31°C) versus a cool 24°C Genoa Q2 where the routine held. Shortlist tiers are Challenger-level (note one inconsistency: the Biella entry is named "CH 50 Biella" while its tier field reads CH 75).

### 6.3 Team Sinner (real player, Team dashboard)

Standalone file, not a copy of the player prototype. Sections: 52-week ranking and points at stake, This month's decisions (the optional weeks), Load twelve weeks, Next seven days, Partners obligations calendar, Team & access. Initials JS, demo banner kept, public facts only, team members as roles. Uses `.agenda/.ag`, `.partners`, `.load`, `.demo` styles.

---

## 7. Decision log (with rationale)

Dashboard reordered by importance, then simplified to the "three answers" layout because the owner felt too much was being added. Ranking hero moved to the very top with the player photo. One artifact with hash routing rather than one artifact per section so the sidebar and tab bar really navigate. Sidebar collapse must reclaim the space (content max-width widens). Take-the-tour moved from a text link to a topbar icon. Receipt photo capture built now with batch support. Financial extras chosen: budget vs actual, reserves source, pending prize; bank connection rejected. Fuel scoped to menu photographs. Baseline forecasts placed in Elite; top-100 tier discussed and parked; Team pack and packs built then fully reverted. Notification rail built as a shadcn Sheet. Coach read-only view, first-week state and tier alignment added after a "have we covered everything" review. Real-player demos follow the governance in 6.2; the banner and chip were later removed at the owner's request. Conditions layer built with a racquet visual and a kg/lb toggle. Currency and language added as a Preferences pane with display conversion rather than re-entry. Country flags added as SVG, not emoji. Logo crumb removed from the header in all three files.

---

## 8. Engineering conventions and known traps

Every child of a CSS grid gets an explicit `grid-column`. Grid auto-placement placed items with an explicit `grid-row` first and they stole column 1, scrambling layouts several times (`.card-h`, `.tour`, `.defend`, `.recip`, `.vc`, `.hist-row`, `.ea`, `.pub .tier`, `.pub .next`).

Class names are global in a single file, so check before reusing a short class. Collisions found and fixed: walkthrough `.tour` versus shortlist row `.tour:hover` (renamed `.walk`); `.seat.empty` versus the `.empty` state (`.seat.free`); coach view `.res` versus Match Scribe `.entry .title .res` (`.cvres`); shortlist status badge `.st` versus the Settings layout grid `.st` (renamed `.tst`; this one had silently squashed the shortlist name column for a long time).

Use `minmax(0, 1fr)` for a grid column that holds text next to an auto column, and `min-width: 0` on flex or grid children that must shrink; several mobile overflows came from this (`.seg`, `.ob-side`, `.kv dd.txt`, `.pattern .a`).

`[hidden] { display: none !important }` is required because `.content { display: flex }` otherwise defeats the attribute.

Boot at the end of the IIFE; helpers look elements up at call time. Calling `route()` mid-script caused "Cannot access before initialization" errors.

Fixed-position elements have `offsetParent === null`; test visibility with `getClientRects().length`.

Chart labels collide easily; stagger or hide on narrow widths, and re-check after any data change.

When editing with sed, `&` in the replacement means "the match"; a `&nbsp;` insertion via sed corrupted the file once. Prefer Python string replacement.

`DICT` translation matches whole trimmed text nodes, and `moneyRe` matches `A$` amounts in text nodes. Amounts built from several inline elements will not convert; keep an amount inside one text node.

Berger file: same port discipline as Neumayer, with `pc.sb.*` keys; the word list to check after a port is Arya, Dubey, Marko, Gerhard, Vienna, Austria, Challenger, ATP, M25, his, he. Neumayer file: any Arya-side change must be ported with the story adapted (no Marko, Kovalenko, China, Anning, Zhou), and storage keys must be `pc.ln.*`. A leak check for those words is part of the port script.

---

## 9. Testing harness

Playwright Chromium runs in the Linux sandbox. The Chromium dependency `libXdamage` was missing; it was fetched with `apt-get download libxdamage1`, extracted to `/tmp/libs`, and loaded with `LD_LIBRARY_PATH=/tmp/libs/x/usr/lib/aarch64-linux-gnu PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. Scripts (`/tmp/shotN.mjs`) wrap the artifact file into `/tmp/page.html` with a doctype, head and viewport meta, pre-set `localStorage` (`pc.tour = seen`, or `pc.ln.tour` for Neumayer) in `addInitScript`, listen for `pageerror`, then iterate routes checking `document.querySelector('main:not([hidden])').dataset.route` and `document.documentElement.scrollWidth` (must equal the viewport width at 390px), take screenshots at 1440×900 dark and 390×844, and click via `page.evaluate(() => el.click())` because sticky and overlay elements intercept Playwright's pointer clicks. The sandbox has no emoji font, which is why flags are SVG. Screenshots are thumbnailed with Pillow and read back visually.

Import path for Playwright in the sandbox: `/sessions/<session>/.npm/_npx/<hash>/node_modules/playwright/index.mjs` (session specific; re-install with `npx playwright` if absent).

---

## 10. How the Neumayer port was done (repeatable)

`diff procircuit-dashboard.html procircuit-dashboard-neumayer.html` lists hunks. Hunks marked `d` (present only in Arya) are the features to port; `c` hunks are checked for feature content versus persona differences (photo data URI, names, numbers). A Python script reads the Arya lines by number, applies a `neum()` text adapter (equipment strings, story words, storage keys), then applies insertions and line replacements bottom-up by Neumayer line number so earlier line numbers stay valid, and finally greps for leaked Arya-only words. Then the Playwright route sweep and publish.

---

## 11. Publishing

Publish with the Artifact tool: `file_path` plus the `url` from section 2, with a short `label`. Found on 13 Sep: the three original artifacts (Arya, Neumayer, Team Sinner) live in a different claude.ai organisation from the one the 13 Sep session was signed in to, which is why earlier sessions could not read them back. From the current organisation the player files were published as new artifacts (Current URLs in section 2); the admin console was published in the current organisation from the start. To update the original URLs, sign in to that organisation and publish with `url`. Team Sinner was published in the current organisation on 13 Sep.

## 12. Open items and backlog

Decisions: all seventeen in DECISIONS-WORKSHEET.md were recorded on 13 Sep (v0.2). Applied to both player files on 13 Sep (v0.3, script `fixpass.py` in the session): password field removed from #/signin (magic link and passkey); audio copy 7 days and transcription 'usually within twenty seconds'; payout table now Gross · Fee 8% · Stripe · Paid (A$612 → A$49 → A$14 → A$549), formula `gross*.92 - Stripe`, MRR tooltip 8 percent; September P&L excludes the pending Genoa cheque (−A$3,028, A$612 in); consequence sentence on the dashboard publish card; patron-update language single-select; Fan Agent switch is now 'Review before sending'; share links show expiry and a Renew action; Settings > Notifications is two rows per agent (For you, FYI); Antalya frames 4 with 'you carry 4'; retention 92 percent labelled illustrative; provider names replaced by 'Drafting model', 'Extraction model', 'Structured-output model'; money rule check reworded (C4); outreach greeting fixed to Katrin; Neumayer 'CH 50 Biella' → 'CH 75 Biella'. Not applicable in the prototype (no Free-tier mode exists): Free-tier locked states for the Tournament detail and Fuel. Still to do from the register: nothing in section B remains open except B11 (racquet legend in Settings is static markup, fine for a prototype) and B21 (Fan Q&A toggle, consistent with the Pro preview). Earlier list of downstream edits, kept for reference: remove the password field from #/signin; fix the payout arithmetic to 8 percent and label Stripe's charge separately; fix the September P&L to exclude the pending prize and store the Genoa prize in euro; audio retention copy to 7 days in four places; consequence sentence on the dashboard Content Agent card; patron-update languages single-select; Fan Agent label switch becomes 'review before sending'; share-link expiry date and Renew; Settings > Notifications rebuilt as two rows per agent; Free-tier locked states for Tournament detail and Fuel; PRD-06 mood window 90; PRD-00 section 8 moves M-LANG-3 to Release 2 and section 10 closes the Free-shortlist and fee-basis questions; PRD-04 and PRD-03 fee formulas on gross.

Extend `DICT` coverage beyond navigation, titles, tiles and buttons if Chinese and Spanish become real targets. Consider an EUR home currency for European players (owner specified AUD, USD, CNY only). Fix the Neumayer "CH 50 Biella" name versus CH 75 tier. Real OCR and translation behind Fuel and receipt scanning (the prototype uses staged samples). Real Whisper, structured extraction and TimesFM behind Match Scribe and the forecast. A Windows Chrome pass for fonts and rendering. A full mobile QA sweep of every route after each large change (the harness makes this a one-command job). Team Sinner is a separate file; if the Team view becomes a product surface it should be re-based on the player shell.

---

TECH-ARCHITECTURE.md v0.4 (14 Sep) adds section 3a, where MCP fits: not in the scheduled agents (single-shot bundles stay), yes for building (Supabase, Vercel, Stripe test mode, Sentry, GitHub servers for Claude Code) and for operating (an admin MCP server over the console API with roles, reasons and audit rows, build step 5.0); Fan Agent grounding and a player-scoped server are later. The architecture page and BUILD-PLAN-CLAUDE-CODE.md carry the same. v0.2 (13 Sep) reflects the twenty decisions and PRD-13: `payouts`, `admin_actions`, `admin_users`, `cases`, feed and import tables, deletion cooling-off fields on `players`, `fan_answers` with a reviewed-by check, share-link renewal, single-language `patron_updates`, epic E18 for the admin console, unit economics recomputed at A$10.83 against the A$7.35 cap.

SYNTHETIC-DRY-RUN.md (13 Sep) and `synthetic-sessions/`: eight invented personas played by a language model went through the research kit's session; the synthesis scores them on the kit's sheet, lists 13 changes to make to RESEARCH-KIT.md before real sessions, and ten hypotheses. It is not evidence about players and says so on its first line. RESEARCH-KIT.md v0.2 (13 Sep) folds the thirteen changes in: 70-minute session, stimulus rule and mismatch tagging, tour, doubles and buyer quotas, minors and health-information rules, task 1 records the first touch, task 2 asks the player to imagine their own airport, task 3 allows typing or a private recording, task 6 scores the sentence not the label and runs on both surfaces, pricing anchors from the player's own numbers in their own currency with 'whose money' first for parent-funded players, and a do-not-explain rule with one scripted answer about audio. The strongest signals were about the kit and the stimulus (WTA, UTR, doubles, currency and parent-as-buyer are all unaddressed), the 'Approve & publish' label, and the cost side of the shortlist.

BUILD-PLAN-CLAUDE-CODE.md (14 Sep): the step-by-step plan to hand Claude Code, one step per session, with acceptance checks and prompts, and a CLAUDE.md for the repository root. Order: foundation and the approval gate first (Phase 0), then Match Scribe and Mindset Coach as the first usable slice (Phase 1), money (Phase 2), feeds with the manual ingestion path, Tournament Agent and Conditions (Phase 3), Fans, Content and Fuel (Phase 4), admin console, notifications, mobile shells and hardening (Phase 5).

PRELAUNCH-CHECKLIST.md (14 Sep): everything ProCircuit needs that is not the product, in six blocks with owners, windows counted from the founding engineer's week 1, what each item blocks, and a done test. Now (data licence conversations with the ATP, WTA and ITF, launch markets against Stripe Connect Express coverage, entity, domain and sending domain, accounts, founding engineer, runway, research recruiting); before engineering commits (legal review of the guardian, distress, audio, deletion and Fan Agent rules, privacy policy from a data map, player and patron terms, real research sessions and a RESEARCH-SYNTHESIS.md, scope confirmation, trademark, insurance); before first player (backup drill, audio lifecycle and gate proofs, support inbox, distress on-call, breach procedure, security pass, analytics, status page, founding-player note); before charging (Stripe live, pricing copy, money tests, refunds, reconciliation, payout fallback, cost instrumentation, dunning, billing pane); before public launch (marketing site in Baseline, help centre, founding-player outreach, real-person review, pen test, load rehearsal, app stores, launch comms, runbooks, go and no-go); after launch (weekly, monthly, quarterly cadences). Section 7 draws the dependency chains. Items that change a PRD go through the review register, not the checklist.

## 13. Quick reference

Player file routes: `#/`, `#/first-week`, `#/agent/tournament`, `#/match-scribe`, `#/agent/financial`, `#/fans`, `#/agent/content`, `#/agent/mindset`, `#/fuel`, `#/onboarding`, `#/profile`, `#/settings`, `#/agent/sponsor`, `#/agent/fan`, `#/coach`, `#/signin`.

Settings panes (`data-st` / `data-st-pane`): account, prefs, billing, notif, agents, equip, conn, share, data.

Data arrays in the script: `T` (shortlist), `PENDING` (prize), `X` (ledger), `PZ` (prize history), `TIERS`, `EST` (budget vs actual), `SAMPLES` (receipts), `PATRONS`, `CH` (content history), `PATTERNS`, `NOTES` (notifications), `TOUR`, `PICKS` (Fuel), `PLACE` (flag lookup).

Global helpers: `$`, `el`, `money`, `fmtA`, `axisK`, `toU`, `convT`, `applyUnit`, `setUnit`, `fl`, `pflag`, `localizeTree`, `applyPrefs`, `toast`, `route`.

Storage: `pc.tour`, `pc.state`, `pc.sidebar`, `pc.unit`, `pc.prefs` (Arya); `pc.ln.*` (Neumayer).

Prices: Pro A$49 / A$39 annual, 8 percent fee, 50-patron cap. Elite A$149 / A$119 annual, 5 percent fee, forecasts, Studio agents. Trial 14 days, no card.
