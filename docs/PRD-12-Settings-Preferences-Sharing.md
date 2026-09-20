# PRD-12 · Settings, Preferences and Sharing

Version 0.2 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/settings` (`stNav`, the nine `data-st`/`data-st-pane` panes: account, prefs, billing, notif, agents, equip, conn, share, data), `#/signin` (`siEmail`, `siGo`), the user menu (`umenu`, `signOut`) and preference controls (`prefLang`, `prefCur`, `prefSpoken`, `prefPatron`, `prefUnits`). This is a platform surface rather than an agent, so section 3 is a system contract: the same seven headings PRD-01 uses for the Tournament Agent, applied to the settings, preferences and sharing flows instead of a scheduled run. Equipment pane content is specified in PRD-08 and only referenced here.

---

## 1. Purpose and job to be done

Every cross-cutting promise this product makes (M-GATE, M-ID, M-DATA, M-LANG, M-CUR, M-NOTIF, M-SHARE, M-PRIV, M-PLAT in PRD-00 section 5) has to live somewhere the player can see and change it, or it is not a promise, it is a claim. Settings is that somewhere: nine panes turning abstract platform rules into concrete controls, account, language and currency, plan and invoices, notification channels and quiet hours, agent schedules, equipment, connections, share links, and data and safety. Sharing is the part that lets a player who runs their career alone bring in a coach or a manager without losing control of what each one sees.

Job statement: "Let me see and change anything the agents assume about me, currency, language, units, who runs when, who can see what, in one place, so that I never have to guess what the product knows or trust it blindly."

Success: a player can find and change any of the nine panes in two taps from anywhere in the app; changing a preference (language, currency, units) takes effect everywhere, including inside agent-written prose, before the player leaves the pane; a coach or manager link is created, scoped correctly and revoked within one minute of the player asking; no player ever discovers a hidden default they did not choose.

## 2. Users and entitlements

The player is the only user who edits Settings; there is no coach- or manager-facing settings surface, only the read-only views those roles reach through their share link. Every pane is visible regardless of tier; gating happens inside a pane, not by hiding it; Plan & billing shows the actual plan and upgrade path, Agents shows Sponsor and Fan rows dimmed with an "Elite" badge per M-TIER-1 rather than removing them, and Connections shows Stripe Connect Express and Resend regardless of plan since every tier can hold a public profile.

Sign-in and sign-out are reached from outside the signed-in shell (`#/signin`) and from the user menu inside it; documented here as the mechanical bookends of every Settings session, not because they belong to another agent document.

## 3. System contract

**Trigger.** Settings opens from the sidebar footer, the user menu, or directly at `#/settings`, defaulting to Account with `#stNav` holding all nine panes at all times; switching panes is instant, client-side, no reload. Share links are created and revoked from the Sharing pane on demand, with no scheduled trigger. Sign-out fires from the user menu; sign-in fires from `#/signin`.

**Inputs.** Account name, email, time zone, country; Preferences language, home currency, spoken language, patron-update languages, units, date/number format; Billing plan and cycle changes; Notifications per-event channel toggles and quiet hours; Agents per-agent schedule and pause state; Equipment profile (PRD-08); Connections actions (open, copy link, disconnect where offered); Sharing link creation and revocation; Data & safety export, audio deletion and delete-account requests.

**Outputs.** A saved player record reflecting every pane; a live re-render of the whole app under a changed language, currency or unit system, including the agents' own prose; an updated Stripe subscription on a plan change; updated agent-run schedules; a created or revoked share-link token; an export file or a scheduled account deletion.

**Approval gate.** Every save requires an explicit action: preference, account and equipment panes each end in an explicit "Save" button rather than saving on blur; billing changes route to Stripe's own customer portal for anything touching the card on file; downgrading shows a confirmation restating what pauses and what is retained before it takes effect at the period end; deleting the account requires an emailed confirmation link, "nothing happens until you click it," described further in section 12 against M-PRIV-2's 14-day cooling-off requirement.

**Failure behaviour.** A failed save should leave the pane edited and unsaved with an inline error rather than silently reverting; the prototype only models the success toast ("Saved"). A share link that fails to revoke should show a clear "still active" state rather than a false success; the prototype's revoke is instantaneous and unconditional. Failed connections (a disconnected Stripe account, an expired ATP token) should use the same red/amber badge language already used for a healthy connection, not a generic error.

**Audit.** Every setting change, plan change, share-link creation and revocation, and data-safety action is logged with player, timestamp and device per M-GATE-4, and the log itself is visible to the player from the Data & safety pane rather than only to the platform.

**Cost.** Settings itself carries no model cost; the only metered calls it triggers are Stripe operations (billing) and the ranking-feed connection checks, both flat-rate and negligible against the Pro price (PRD-00 section 6's 15 percent cost ceiling).

## 4. Surfaces and states

### 4.1 Settings shell and navigation (`#/settings`)

A left nav (`#stNav`) lists all nine panes as plain links, each carrying a `data-st` value (account, prefs, billing, notif, agents, equip, conn, share, data) that shows the matching `data-st-pane` card and marks itself active; there is no locked or hidden pane, consistent with M-TIER-1's rule that a gated surface always shows real UI rather than a blank one.

### 4.2 Account

Name, email ("Verified · used for sign-in and agent emails"), a "Register a passkey" action, and time zone (Europe/Vienna (CEST), or "Follow my phone") with the note "Mindset Coach runs at 06:00 in this zone." One Save button.

### 4.3 Preferences

App language as a toggle group (English, 中文, Español) with "Menus, labels and buttons. Your notes and drafts are never translated without asking" (M-LANG-1). Home currency as a toggle group with flags (A$ AUD, US$ USD, ¥ Yuan) and "Everything is stored in the currency it happened in and converted at that day's ECB rate. Prize money stays in the paying currency until it lands. Patron tiers are priced in your home currency through Stripe" (M-CUR-1, M-DATA-1). Match Scribe spoken language (Auto-detect via Whisper, or a fixed language) with "Auto-detect handles switching mid-note" (M-LANG-2). Patron-update languages as a multi-select (English and Deutsch both on in the reference data) with "The Content Agent drafts one version per language; you approve each. The Mindset Coach speaks to you in the first one you pick here" (M-LANG-3). Units as a toggle group (Metric · kg · °C · km, or Imperial · lb · °F · mi), two-way synced with the kg/lb segmented control in Equipment (M-CUR-2). Date and number format as a select (12 Sep 2026 · 1,234.50; 09/12/2026 · 1,234.50; 2026-09-12 · 1 234,50). One Save button, with "Time zone lives under Account" as a footer note.

### 4.4 Plan & billing

Header states the plan plainly: "Pro · A$49 a month · renews 3 October · 12 of 50 patrons." A card shows the card on file ("Visa ending 2210 · Held by Stripe · expires 08/28") with "Manage in Stripe," and a separate card for patron payouts via Stripe Connect. An invoice table lists the last three charges (3 Sep, 3 Aug, 3 Jul 2026, each A$49.00, one marked "Free → Pro") with a PDF action per row. The footer offers "See what Elite adds" and "Downgrade to Free," the latter confirming first: "Pause for a month instead? Downgrade takes effect 3 Oct · Financial and Mindset pause, nothing is deleted."

### 4.5 Notifications

A matrix (`#notif`) of two rows per agent, For you and FYI, against In app, Email and Push (Tournament Agent, Content Agent, Mindset Coach, Financial Agent, Fans), with the events each row covers named as sub-text (for example Tournament Agent · For you: "Entry deadline in 3 days and 1 day · always at least one channel"; Fans · FYI: "Patron joined, payout sent (Fridays)"). Decided 13 September 2026 (worksheet 13) to match M-NOTIF-1. Below it, one quiet-hours control: "Quiet hours · 22:00 to 07:00 · Only entry deadlines under 24 hours break through" (M-NOTIF-2).

### 4.6 Agents

One row per agent (Tournament, Content, Mindset, Financial) with the model in use, cadence in plain language ("GPT-4o · weekly · 17 events last run"), a schedule select and a pause switch; a dimmed Sponsor/Fan row carries an "Elite" badge and a preview link. A footer line points weekly budget, surfaces and blocked dates back to the Tournament Agent's page rather than duplicating them.

### 4.7 Equipment

Specified fully in PRD-08; this pane hosts frame, string, tension (kg/lb synced to Preferences), frames carried, restring cadence, overgrip, practice balls, and the "stamp notes with conditions" switch, referenced not duplicated here.

### 4.8 Connections

A list of external connections, each with a status badge: ATP ranking (TDI live feed, player ID, Monday 02:00 UTC), ITF ranking and calendar (weekly), Stripe Connect Express ("Patron payments and payouts · KYC complete," with "Open"), Resend (patron email, domain verified), Calendar feed (a copyable .ics link), and Bank, dimmed, "Not offered. Balances are entered by you; receipts are scanned. ProCircuit never holds bank logins," an explicit decision, not a gap.

### 4.9 Sharing

Two link cards: Coach ("Marko · opened 4 times this week. Sees match data, Match Scribe summaries (not transcripts), tournament shortlists and Mindset patterns. Never money") with Preview, Copy and Revoke and a scope strip (Matches, Shortlists, Patterns ticked; Transcripts, Money crossed); and Parent/manager ("Gerhard B. · opened Sunday. Sees runway, P&L, expenses and patron health. No agent outputs, no notes") with Copy and Revoke and its own strip (Runway & P&L, Expenses, Patrons ticked; Notes, Agent drafts crossed). A footer action creates another link with a chosen scope.

### 4.10 Data & safety

Match Scribe audio ("Kept 90 days in Cloudflare R2, then deleted. Transcripts are kept until you delete them") with "Delete all audio now"; Export everything (notes, transcripts, expenses, updates, patron list, JSON and CSV, emailed when ready); Someone to call (the Mindset Coach's escalation contact, editable, alongside the ATP Player Assistance line and Lifeline); and a danger-zone card for Delete account ("Cancels the plan, deletes notes, transcripts, audio and expenses. Patron subscriptions end and Stripe payouts stop after the final one. Your public page returns a plain 'moved on' note for 30 days"), gated by an emailed confirmation link.

### 4.11 Sign in, sign out and the user menu

`#/signin` is a bare shell with the logo, an email field, the line "We email you a link that signs you in. No password to remember, none stored." with a "Use a passkey instead" option, an "Email me a sign-in link" button, and "Create an account" back to onboarding. No password field (decided 13 September 2026, worksheet 11). The user menu shows the player's name and email, then Public profile, Settings, Replay setup and Sign out; Sign out routes to `#/signin` with "Signed out," and signing back in returns to the dashboard with "Welcome back."

## 5. Functional requirements

ST-1 (Must). Settings shows all nine panes in `#stNav` at all times, with no pane hidden or locked regardless of plan (M-TIER-1); switching panes is instant and client-side.

ST-2 (Must). Account lets the player change name, email, time zone and register or remove a passkey, with the time zone explicitly tied to the Mindset Coach's daily run time.

ST-3 (Must). Preferences exposes exactly three app languages, three home currencies, a spoken-language override, a multi-select of patron-update languages, a Metric/Imperial toggle, and a date/number format select, and states plainly that the player's own notes and drafts are never translated without being asked (M-LANG-1).

ST-4 (Must). Changing home currency re-renders every amount and chart axis across the app, including inside agent-written prose, while preserving the original transacted currency and rate underneath (M-CUR-1, M-DATA-1).

ST-5 (Must). Changing units re-renders tension, temperature and distance everywhere, including inside agent prose, and stays two-way synced with the kg/lb control in Equipment (M-CUR-2).

ST-6 (Must). Patron-update languages drive exactly one drafted version per language from the Content Agent, each approved separately by the player, and the first language in the list is the one the Mindset Coach addresses the player in (M-LANG-3).

ST-7 (Must). Plan & billing states the plan, price, renewal date and patron-cap usage in one line, and links out to Stripe's own portal for anything touching the card on file.

ST-8 (Must). Downgrading to Free shows a confirmation naming what pauses (paid agents) and what is retained (patrons, ledger, notes) before the change is scheduled for the period end (M-TIER-2).

ST-9 (Must). Notifications exposes two rows per agent, For you and FYI, against in-app, email and push, naming under each row the events it covers (entry deadlines, shortlist readiness, drafts, morning insight, patterns, runway state, reserves reminder, patron changes, payouts); entry deadlines always keep at least one channel (M-NOTIF-1, M-NOTIF-2).

ST-10 (Must). Quiet hours default to 22:00–07:00 local and are overridable per player; only entry-deadline notifications inside 24 hours ignore quiet hours (M-NOTIF-2).

ST-11 (Must). Agents shows each agent's model, cadence and a pause switch, and a schedule change takes effect on the agent's next scheduled run without requiring a manual re-run.

ST-12 (Should). Elite-only agents (Sponsor, Fan) appear in the same list, dimmed, with an "Elite" badge and a link to their preview, never removed from the list (M-TIER-4).

ST-13 (Must). Connections shows a live status badge for every external system (ATP, ITF, Stripe Connect Express, Resend, calendar feed) and states explicitly that no bank connection exists and why.

ST-14 (Must). Sharing shows exactly two link types, coach and manager, each with its fixed scope displayed as a checklist of what is and is not included, matching M-SHARE-1 and M-SHARE-2 exactly.

ST-15 (Must). Revoking a share link takes effect within one minute and is reflected immediately in the Sharing pane's status (M-SHARE-3).

ST-16 (Must). Sharing shows when each link was last opened and how many times, and the date it expires (90 days from creation or last renewal), with a Renew action that resets the period (M-SHARE-3; decided 13 September 2026, worksheet 12).

ST-17 (Must). Data & safety exposes an export of everything (notes, transcripts, expenses, updates, patron list) in JSON and CSV, delivered by email (M-PRIV-2).

ST-18 (Must). Data & safety states the audio retention window and offers an immediate manual deletion, distinct from the automatic one (M-PRIV-1).

ST-19 (Must). Delete account requires an emailed confirmation link; clicking it starts a 14-day cooling-off during which patron billing is paused, agents pause, the public page shows the "moved on" placeholder and the player (or support at the player's request) can cancel; deletion becomes irreversible only when the window ends. The Data & safety copy states the 14 days (M-PRIV-2; decided 13 September 2026, worksheet 4).

ST-20 (Must). Data & safety lists the model providers and regions in use and states that none of them train on player data (M-PRIV-4).

ST-21 (Must). Sign-in is by magic link with an optional passkey and nothing else; no password is collected or stored (M-ID-1; decided 13 September 2026, worksheet 11).

ST-22 (Must). Sign-out is reachable in two taps from anywhere signed in (user menu) and returns the player to `#/signin` without discarding any unsaved Settings changes silently; unsaved changes should prompt before discarding.

ST-23 (Should). The user menu shows the player's photo or initials, name and headline ranking figure, and offers Public profile, Settings, Replay setup and Sign out in that order.

ST-24 (Must). Every setting change, plan change, share-link action and data-safety action is recorded in an audit log visible to the player from Data & safety (M-GATE-4).

ST-25 (Could). A "still active" warning appears if a revoked share link is somehow reopened, rather than failing silently.

ST-26 (Won't, Release 1). Direct coach accounts as an alternative to link-based sharing (deferred to Release 2 per M-SHARE-4 and PRD-00 section 8).

## 6. Data dictionary

Player settings record:

| Field | Type | Source | Notes |
|---|---|---|---|
| name, email, timeZone, country | string ×4 | player | timeZone drives Mindset Coach's run time |
| appLanguage | enum en, zh, es | player | M-LANG-1 |
| homeCurrency | enum AUD, USD, CNY | player | M-CUR-1 |
| spokenLanguage | enum auto, en, zh, es, de | player | Match Scribe (M-LANG-2) |
| patronLanguages[] | array | player | Content Agent draft set (M-LANG-3) |
| units | enum metric, imperial | player | synced with Equipment |
| dateFormat | enum | player | display only |
| plan, billingCycle | enum, enum | player and Stripe | Plan & billing |
| quietHoursStart, quietHoursEnd | time, time | player | default 22:00–07:00 |
| notifMatrix | object per event × channel | player | ST-9 |
| agentSchedules | object per agent {cadence, paused} | player | ST-11 |
| emergencyContact | string | player | Someone to call |

Share link:

| Field | Type | Source | Notes |
|---|---|---|---|
| id, scope | string, enum coach, manager | platform | fixed scope per M-SHARE-1/2 |
| token | string, 128-bit random | platform | M-PLAT security |
| createdAt, lastOpenedAt, openCount | timestamp, timestamp, integer | platform | ST-16 |
| revoked, expiresAt | boolean, timestamp | platform | 90-day expiry, M-SHARE-3 |

Data-safety record: exportRequestedAt, exportDeliveredAt, audioRetentionDays (default 90 in the prototype, 7 per M-PRIV-1, see section 12), deleteRequestedAt, deleteConfirmedAt, deleteEffectiveAt, providerList[].

## 7. Business rules and formulas

Currency display: every amount renders at the ECB reference rate for the day the underlying transaction occurred, never today's rate, with the original currency and amount always available on demand (M-DATA-1); changing home currency changes display only, never the stored ledger value.

Units conversion: kg to lb multiplies by 2.2046 and rounds to the nearest whole or half unit as the control dictates; a text rewrite pass finds tension-pattern strings ("24/23") and quantity phrases ("a kilo") inside already-generated agent prose and rewrites them in place rather than requiring the agent to regenerate.

Quiet hours: a notification queued between 22:00 and 07:00 local is held until 07:00 unless it is an entry-deadline notification inside 24 hours of the deadline, which is delivered immediately regardless of the hour (M-NOTIF-2).

Downgrade retention: moving from Pro or Elite to Free takes effect at the current billing period's end, never immediately; paid-tier agents pause rather than delete their data, patron billing pauses with a notice to patrons, and the player can export everything at any point before or after the change (M-TIER-2).

Share-link lifecycle: a link is valid for 90 days from creation or last renewal, is revocable in one tap, and a revocation must be reflected everywhere within one minute of the action (M-SHARE-3); scope is fixed at creation to coach or manager and cannot be partially customised in Release 1.

Delete-account timeline: a request generates a confirmation email; clicking it starts a cooling-off period (14 days per M-PRIV-2) during which the account can be recovered; only after the period elapses without recovery does deletion become irreversible and patron billing stop for good.

## 8. Acceptance criteria

ST-AC-1. Given the player opens `#/settings`, when the page renders, then all nine panes are listed in `#stNav`, Account is active by default, and no pane shows a locked or blank state.

ST-AC-2. Given the player's home currency is AUD, when they switch it to CNY in Preferences, then every visible amount on the next dashboard view (runway, P&L, chart axes) renders in ¥ at the day's ECB rate, with the original AUD figure still available.

ST-AC-3. Given Units is set to Metric, when the player switches to Imperial, then the Equipment pane's tension control shows lb instead of kg, and any agent-authored sentence containing a tension figure updates its unit to match.

ST-AC-4. Given Patron-update languages includes English and Deutsch, when the Content Agent drafts an update, then two versions are produced, and the Mindset Coach addresses the player in English, the first language in the list.

ST-AC-5. Given the player is on Pro, when they open Plan & billing, then the header reads "Pro · A$49 a month · renews 3 October · 12 of 50 patrons," and the invoice table lists the three most recent charges with a PDF action each.

ST-AC-6. Given the player taps "Downgrade to Free," when the confirmation appears, then it states the change takes effect 3 October and that Financial and Mindset pause while nothing is deleted.

ST-AC-7. Given quiet hours are 22:00 to 07:00, when an entry-deadline notification fires at 23:00 with 12 hours left before the deadline, then it is delivered immediately rather than held until 07:00.

ST-AC-8. Given the Tournament Agent's schedule is changed from Sunday 20:00 UTC to Saturday 20:00 UTC in Agents, when the next scheduled run occurs, then it fires at the new time without a manual re-run.

ST-AC-9. Given the player opens Connections, when the page renders, then ATP, ITF, Stripe Connect Express and Resend each show a green "Connected" or "Verified" badge, and Bank shows "Not offered" with the explanation that balances are entered manually.

ST-AC-10. Given the coach link's scope strip is inspected, when it renders, then Matches, Shortlists and Patterns show as included and Transcripts and Money show as explicitly excluded.

ST-AC-11. Given the player taps Revoke on the coach link, when the action completes, then the link's status changes to inactive within one minute and Marko's next attempt to open it fails.

ST-AC-12. Given the player taps Export under Data & safety, when the request is made, then a toast confirms an export is being prepared and it is later delivered by email as JSON and CSV.

ST-AC-13. Given the player taps Delete under the danger zone, when the action fires, then a toast states a confirmation link has been emailed and that nothing happens until it is clicked, per the cooling-off requirement.

ST-AC-14. Given the player is signed in, when they open the user menu and tap Sign out, then the app routes to `#/signin` with a "Signed out" toast, and tapping Sign in returns to the dashboard with "Welcome back."

## 9. Notifications produced

Settings itself produces confirmation toasts rather than persisted notifications ("Saved," "New link · choose coach or manager scope," "Coach link revoked," "Export ready in a few minutes"). The one persisted, cross-cutting notification this document owns is the weekly digest (M-NOTIF-3): when a player would otherwise receive more than five FYI emails in a week, Settings' notification preferences collapse them into a single digest, configurable from the Notifications pane.

## 10. Sharing scope

This document is the home of M-SHARE-1 through M-SHARE-4. Coach link: match results, Match Scribe summaries (never transcripts or audio), tournament shortlists and entry decisions, Mindset patterns and Conditions briefs; never money, never mood-by-date. Manager link: runway, reserves, P&L, expenses with receipts, patron health and payouts; never notes, never agent drafts. Both links are revocable in one tap, show last-opened time and count, and expire after 90 days without renewal, with revocation effective within one minute. Direct coach accounts (an invited teammate rather than a link) are Should-level and deferred to Release 2 per PRD-00 section 8.

## 11. Analytics events

settings_opened (pane), setting_changed (pane, field), preference_language_changed, preference_currency_changed, preference_units_changed, preference_patron_languages_changed, plan_changed (from, to, cycle), downgrade_confirmed, notification_toggle_changed (event, channel), quiet_hours_changed, agent_schedule_changed (agent), agent_paused (agent), share_link_created (scope), share_link_revoked (scope), share_link_opened (scope), export_requested, export_delivered, audio_deleted_manually, delete_account_requested, delete_account_confirmed, delete_account_cancelled, sign_in, sign_out. Product KPIs: median time to find and change a setting (target under two taps from any route), share-link revocation latency (target under one minute), weekly-digest adoption among players with more than five FYI emails a week.

## 12. Out of scope and open questions

Out of scope for Release 1: partial or custom scopes on share links beyond the fixed coach and manager sets; direct coach accounts (M-SHARE-4, deferred to Release 2); a stringer share scope (PRD-00 section 10); additional languages or currencies beyond the launch set; per-field notification overrides beyond the existing event-by-channel matrix.

Open questions (fee basis, expiry visibility and the cooling-off copy were settled on 13 September 2026): whether a failed save or revoke needs a dedicated error design, since the prototype only models the success path.

Inconsistencies found between the prototype and PRD-00, all resolved on 13 September 2026 (worksheet 3, 4, 11, 12, 13; prototype v0.3 applies the sign-in, audio, expiry and notification changes, and the cooling-off copy is a build item). Kept for the record: M-ID-1 specifies sign-in by magic link with an optional passkey and no stored passwords; `#/signin` nonetheless shows a password field with "Forgot it?" and `autocomplete="current-password"` alongside a separate magic-link option, offering a password path the master document rules out. M-PRIV-1 requires Match Scribe audio deleted once the transcript is confirmed or after 7 days, whichever is first; Data & safety instead states audio is "kept 90 days in Cloudflare R2, then deleted," a materially longer window. M-PRIV-2 requires a 14-day cooling-off period before deletion takes effect; the delete-account copy promises only an emailed confirmation link ("nothing happens until you click it") with no cooling-off period stated anywhere, so the safeguard exists in name but not the duration specified. M-SHARE-3 requires a visible 90-day expiry on every share link; Sharing shows who opened a link and when but no expiry countdown, so a player cannot see a link about to lapse. Finally, the notification matrix is organised by named event (Shortlist ready, Draft ready, and so on) rather than by the For-you/FYI two-category model M-NOTIF-1 defines as the platform's single structure; the two schemes are not obviously reconcilable without deciding whether the event list is a view onto the two categories or a replacement for them.
