# PRD-13 · Platform admin and operations

Version 0.3 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `procircuit-admin.html` (published), a separate file built on the same shell and design preset as the player prototypes. Routes: `#/` overview (`#att`, `#apprList`, `#cSign`, `#cSpend`), `#/players` (`#plTbl`, `#plRows`, `#pdet`, `#delConfirm`), `#/agents` (`#agRows`, `#failList`, `[data-kill]`, `#cRuns`), `#/ingestion` (`#feeds`, `#csvPreview`, `#factRows`), `#/money` (`#cMRR`), `#/trust` (`#cases`), the alerts sheet (`#nt`), the global player search (`#q`, ⌘K) and the role preview in the user menu (`#umenu [data-role]`, applied as `data-role` on `.shell` with `.owner-only` and `.ops-only` visibility classes). This is a platform surface used by ProCircuit staff rather than by players, so section 3 is a system contract in the same shape PRD-12 uses. Nothing in this document changes what a player sees except where an admin action is explicitly required to notify the player.

---

## 1. Purpose and job to be done

Every promise the player-facing documents make has a person behind it once real accounts exist. A ranking that fails to verify, a payout that is held, a morning run that dies on a weather API, a guardian who never confirms, a patron who reports a Fan Agent answer: each of these needs someone with the standing to look, decide and act, and each needs that action to be as accountable as the agents' own proposals. Without a console those actions happen as ad-hoc database changes by whoever is awake, which is how a product that promises "nothing leaves without a tap" quietly stops keeping the promise on its own side.

The admin console is the internal counterpart of the approval gate: staff propose and act, the audit log records, the player is told when it concerns them. It is deliberately narrow. It does not rebuild what Stripe, Grafana and Resend already do; it links out to them. It does not open player notes, transcripts, audio or moods; it shows the account around them. It is built to the same shell and preset as the player product so that a person moving between the two is never disoriented, but it is styled and reviewed to a lower standard, because its users are three to five staff, not three hundred players.

Job statement: "When something about a player's account, an agent's run, a feed or a case needs a person, let me see it in one place, act on it with the least privilege that does the job, and leave a record the player could read."

Success: a support case is resolved from the console without an engineer touching the database; every admin action carries a name and a reason and appears in the player's own audit log; a stale or broken feed is visible before a player notices; the console shows nothing to a role that does not need it; the model-spend figure that PRD-00 section 6 caps at 15 percent of the Pro price is visible every day rather than discovered at month end.

## 2. Users and entitlements

Three staff roles, granted per person, with the console showing only the areas a role holds (hidden, not merely disabled, so that a screenshot of the console cannot leak an area to someone who should not see it).

| Role | Areas | Typical holder |
|---|---|---|
| Support | Overview, Players (lookup and account actions except delete and comps), Trust and safety (read, resolve cases assigned to support) | Whoever answers player email |
| Ops | Support's areas plus Agent health (pause, run now, retry), Ingestion (feeds, imports, corrections) | The engineer on rotation |
| Owner | Everything, plus Money, provider kill switches, delete account, comps and refunds, role grants | Manu Dubey and one deputy |

Players never see the console and it is served on a separate hostname with staff sign-in (magic link plus mandatory passkey, no shared accounts). A player who is also staff (a founder who plays) uses two identities. The coach, manager, patron and sponsor roles from PRD-00 section 2 have no console access of any kind.

A fourth read-only "Auditor" role for an accountant or a lawyer is Could-level (AD-29).

## 3. System contract

**Trigger.** The console is opened by a staff member on demand. It also produces alerts on a schedule: after the 07:00 UTC morning batch completes or fails, when a feed misses its expected refresh window, when a case is opened by a rule (distress pattern, patron report, guardian timeout), and nightly when the aggregation job that feeds the agent-health tables finishes.

**Inputs.** Player accounts and their platform-owned entities (PRD-00 section 5.3), agent run records and the audit log (M-GATE-4), feed status and import files, Stripe Billing and Connect events, case records raised by rules in PRD-06, PRD-10 and PRD-11, and staff actions with their stated reasons.

**Outputs.** Account changes (trial extension, comp, pause, re-verification, magic link, export, deletion), agent controls (pause, resume, run now, retry), data changes (ranking snapshot applied, fact-sheet correction applied, deadline set), case outcomes, provider kill-switch state, and for every one of these an audit entry with the admin's identity, role, reason and device, plus a player-facing notification where section 9 requires one.

**Approval gate.** The console holds staff to the same rule as the agents. Every action that changes a player's account or money is a two-step: the control, then a confirmation that states in one sentence what will happen (M-GATE-2 applied to staff). Destructive or money-moving actions (delete account, comp, refund, kill switch, apply a ranking snapshot) additionally require a written reason, which is stored verbatim. Nothing in the console can send a message to patrons, sponsors or fans, publish a draft, enter a tournament or move patron money on a player's behalf; those remain player-only actions, and the console's job is to make sure the player can take them.

**Failure behaviour.** A failed action leaves the control in its previous state with an inline error and never a false success toast. A failed morning run is retried three times with backoff and the player is told after the third failure ("This morning's run didn't complete"); the console shows the failure from the first attempt. A feed that misses its window shows an "Attention" badge on the Ingestion page and raises an alert; the last good snapshot stays in use and players are not told unless the staleness would change a decision (a deadline countdown, a ranking refresh a week late), in which case the affected surface shows "as of <date>".

**Audit.** Every admin action is written to the same audit log the player sees under Settings > Data & safety, marked as an admin action with the admin's name, role and reason (AD-4). Read access to sensitive data is also logged: opening a player record is not, since it is the console's basic function, but any time-boxed access to note summaries granted through a case is (AD-10). The console's own log for an admin (everything that person did) is available to the owner and to the admin themselves.

**Cost.** The console has no model cost of its own. Its only metered calls are Stripe and feed refreshes, and the nightly aggregation job that produces the agent-health tables, which runs against the platform's own database. The value it protects is the model-spend line in PRD-00 section 6: the console makes the per-player figure visible daily (AD-19).

## 4. Surfaces and states

### 4.1 Shell

Same shell as the player product: sidebar (Console: Overview, Players, Agent health, Ingestion, Money, Trust and safety; Elsewhere: Stripe, Grafana, Resend as link-outs), topbar with the page title, date chip, an environment badge ("Production · ap-southeast-2"), a global player search (⌘K, by name, email or ATP number, which lands on Players with the filter applied), an Alerts bell with unread count, and the theme toggle. The sidebar footer shows the signed-in admin and role; its menu offers a role preview (useful for checking what support will see), the admin's own audit log, and sign out. Under 900px the sidebar becomes a six-tab bar. Areas outside the current role are removed from the sidebar, the tab bar and the routes; navigating to a hidden route by URL lands on Overview.

### 4.2 Overview (`#/`)

A page title with the date and a one-sentence state of the morning run. Four stats: active players (with signed-up total and weekly active percentage), MRR (with counts by paid tier and the month's movement), trials in progress (with how many end this week and last month's conversion), and the morning run (completed of total, failed count, finish time, median latency). Then "Needs attention": a ranked list of what currently needs a person, sorted launch promises first (child safety, identity, failed runs), then money, then hygiene, each with a one-line consequence and a button into the page that resolves it. Beside it, approval rate by agent (the share of proposal-bearing runs acted on within 48 hours) with the 30 percent threshold called out. Below, two charts: weekly sign-ups against conversions for twelve weeks, and model spend per Pro player for six months against the A$7.35 cap line.

### 4.3 Players (`#/players`)

Four stats: signed up by tier and dormancy, counts by stage, unverified (with how many are ambiguous matches waiting on the player), and under-18 accounts (guardian-linked and pending). A two-column layout: a filterable, searchable table (name with email and flag, ATP or ITF number, stage badge, tier, status badge, patrons against cap, last active) and a sticky detail panel for the selected player.

Statuses: Active, Trial, Past due, Unverified, Minor, Dormant, Deleting. A demo account built on a real person carries a "Demo · public facts" badge (M-PRIV-5).

The detail panel shows identity (initials, name, flag, ranking numbers, stage, tier, status), a guardian notice for minors (M-ID-3), an Account block (email, sign-up date and channel, plan and renewal or trial end, verification state and source, home currency and time zone, languages, agent schedule state, model spend this month), Share links (coach and manager, last opened, with Revoke where a link exists), Actions (send magic link, re-verify ranking, extend trial 14 days, comp Elite one month [owner], pause agents, export data), a privacy notice stating what the console never shows, the player's audit log with admin actions marked, and an owner-only danger zone whose Delete account control opens a confirmation that requires a reason and starts the 14-day cooling-off (M-PRIV-2) rather than deleting.

### 4.4 Agent health (`#/agents`)

Four stats: runs today (morning batch and on demand), failed (count, percentage, retry state), median latency with p95 against the two-minute target, and cost today with cost per run and the transcription share. An agents table: one row per agent with cadence, seven-day runs, success rate, p50 latency, cost per run, approval rate bar, dismiss rate, a Healthy or Under threshold badge, and Run now and Pause [ops] controls. Failed runs: a list of runs that have exhausted or are mid-way through their retries, with the agent, the player, the error string and attempt count, and a Retry control. Queues: transcription backlog, offline uploads pending, weather refreshes failed, emails deferred. A runs-per-hour chart for the last 24 hours with failures in the danger colour. Providers and kill switches [owner]: the structured-output LLM, transcription, TimesFM, and patron payouts, each with what depends on it and a switch that requires a second click within five seconds to turn off.

### 4.5 Ingestion (`#/ingestion`)

Feed cards for every integration in PRD-00 section 7: ATP rankings (singles and doubles), WTA rankings (singles and doubles), ITF men's and women's rankings, ITF calendar, ATP Challenger calendar, WTA 125 and tour calendars, weather, ECB reference rates, Stripe webhooks, Resend delivery events; each with cadence, last and next run, a detail line (row counts, issues), source, and Refresh now and History. Ranking snapshot import: a CSV drop zone, a preview table with the change per player, an unmatched-row count, and an Apply confirmation that states what changes (stages re-detected, dashboards refreshed, N stage changes) and what does not (nothing is sent to players before their next morning run). Fact-sheet corrections: proposed changes to a tournament's fields (ball, deadline, altitude, surface) shown as a before and after diff with the source, and Apply or Reject, where applying a deadline change re-runs the Tournament Agent for players who shortlisted the event. Calendar events missing a deadline: a table of ITF events with no published deadline, how many players shortlisted each, and a date field to set one.

### 4.6 Money (`#/money`) [owner]

Four stats: MRR with the split by tier and the annual-prorated share, platform fee this month with the patron gross it was taken on and a flag that decisions A1 and A2 are open, model and API spend with the per-player figure against the cap, and past-due subscriptions with amount and how many lapse to Free next. MRR by tier for six months. Cost to serve: the per-paying-player model spend broken into transcription, drafting and extraction, and weather, FX and email, with a bar against the cap, and the Elite forecast cost per Elite player shown separately. Patron waitlists on Pro: players at the 50-patron cap with the number waiting and an Offer Elite action (M-TIER-3). Payouts and disputes: held payouts (KYC), chargebacks with evidence due dates, refund requests needing the owner, and a reconciliation line comparing the Stripe balance to the ledger with the time of the last match. Card data, invoices and refunds themselves are in Stripe; the page links out.

### 4.7 Trust and safety (`#/trust`)

Four stats: open cases by kind, "Someone to call" cards shown this month (a count only; the content never leaves the player's device view), delete requests in cooling-off with the earliest date, and export requests with delivery time. Cases, oldest first, each with a kind (distress pattern, profile or answer reported, guardian unconfirmed), when it was opened and by which rule, the sentence that tripped the rule or the report text (never the underlying note), the applicable rule in one sentence, and two actions, the primary one being the safe default (confirm the card was shown, withdraw the answer, resend to the guardian). Data requests: delete requests with days left in cooling-off and a Cancel that restores the account at the player's request, and exports with their delivery state. Real-person governance: the demo accounts that use a real player's name, with the checks required by M-PRIV-5 shown as badges. A privacy line lists the model providers and regions, matching what players see under Data & safety (M-PRIV-4).

### 4.8 Alerts sheet

The right-side sheet lists platform alerts grouped by day with All, Needs action and FYI filters and Mark all read. Needs-action alerts: failed runs after the third attempt, cases opened, feeds missing their window, guardian timeouts, chargebacks. FYI: morning run summary, payouts sent, weekly sign-ups. Routing of alerts to push and email is per role (AD-27).

## 5. Functional requirements

AD-1 (Must). The console is a separate deployment on its own hostname (admin.procircuit.app) built from the same codebase as the player app, with staff sign-in by magic link plus a mandatory passkey; no shared accounts, no player identity may hold a staff role. Decided 13 September 2026 (A18).

AD-2 (Must). Three roles (support, ops, owner) are granted per person by the owner; a role sees only its areas, and areas outside the role are absent from navigation and unreachable by URL rather than shown disabled.

AD-3 (Must). Every action that changes a player's account, an agent's state, platform data or money is a two-step with a one-sentence consequence next to the confirming control (M-GATE-2 applied to staff).

AD-4 (Must). Every admin action is written to the audit log with the admin's identity, role, reason where required, timestamp and device, and appears in the affected player's own audit log marked as an admin action (extends M-GATE-4).

AD-5 (Must). Delete account, comp, refund, apply a ranking snapshot, and any kill switch require a written reason before the confirming control is enabled; the reason is stored verbatim.

AD-6 (Must). The console never displays a player's note transcripts, audio, Fuel or receipt photographs, moods by date, or Fan Agent conversation history; a case shows only the sentence that tripped a rule or a report's own text.

AD-7 (Must). Players is searchable by name, email, country and ATP or ITF number, filterable by tier and status, and the global ⌘K search lands on Players with the query applied.

AD-8 (Must). The player detail panel shows tier, plan state, verification state and source, stage (detected or pinned), share links with last-opened data, agent schedule state, model spend this month (visible to every console role; decided 13 September 2026, A20), and the player's audit log.

AD-9 (Must). Support can send a magic link, re-run ranking verification, extend a trial by 14 days, pause a player's agents, and trigger an export; each writes an audit entry and, for the trial extension and pause, notifies the player.

AD-10 (Should). A case can grant a named admin time-boxed (24-hour) read access to note summaries (never transcripts) for one player; the grant, every read and the expiry are logged and the player is notified of the grant.

AD-11 (Must). Delete account from the console starts the same 14-day cooling-off as the player's own request (M-PRIV-2), emails the player at once, and can be cancelled by the player or by support during the window.

AD-12 (Must). Minors (M-ID-3) show a guardian notice in the detail panel with the confirmation state; support can resend the guardian email; an unconfirmed guardian at 14 days limits the account per PRD-11 and opens a case.

AD-13 (Must). Agent health shows, per agent, seven-day runs, success rate, p50 latency, cost per run, approval rate and dismiss rate, from a nightly aggregation of `agent_runs` and `approvals`, with the 30 percent approval threshold marked (PRD-00 section 6).

AD-14 (Must). Failed runs are listed from the first failed attempt with the error string, and ops can retry a run or a batch on demand; after the third failure the player is told ("This morning's run didn't complete") and the run stays listed until it succeeds or is dismissed with a reason.

AD-15 (Must). Ops can pause and resume any agent globally or for one player; pausing stops proposals only, never undoes anything approved, and players with a paused agent see a plain notice on that agent's page.

AD-16 (Must). The owner can turn off a provider (LLM, transcription, TimesFM, patron payouts) with a two-click confirmation; every dependent agent pauses with the same plain notice, and payouts held by a switch are released in order when it is turned back on.

AD-17 (Must). Ingestion shows every integration in PRD-00 section 7 with cadence, last and next run, and a detail line, and raises an alert when a feed misses its expected window by more than one cadence.

AD-18 (Must). Ops can import a ranking snapshot by CSV with a preview of per-player changes and an unmatched-row list, and apply it with a confirmation stating the stage changes it causes; applied snapshots follow the same path as feed refreshes (stage re-detection, chart refresh, no player notification before the next morning run).

AD-19 (Must). The Money page shows model and API spend per paying player for the month to date against the 15 percent cap, broken down by cost category, and raises an owner alert at 80 percent of the cap.

AD-20 (Must). Fact-sheet corrections are proposed with a source, shown as a before and after diff, and applied or rejected by ops; a deadline change re-runs the Tournament Agent for every player who shortlisted the event.

AD-21 (Must). Calendar events with no published deadline are listed with the number of players who shortlisted them; setting a deadline starts their countdowns and re-runs their shortlists.

AD-22 (Must). Money shows MRR by tier, platform fee taken with the patron gross it was taken on and the fee basis in force, past-due subscriptions with their lapse date, held payouts, chargebacks with evidence due dates, refund requests, and a daily reconciliation of the Stripe balance against the ledger.

AD-23 (Must). Players at the Pro patron cap are listed with their waitlist count, and the owner can send an Elite offer; invitations to the waitlist follow the rule decided under PRD-04's open question.

AD-24 (Must). Trust and safety lists cases opened by rule (distress pattern per PRD-06, reported profile or Fan Agent answer per PRD-10 and PRD-11, guardian timeout per PRD-11) oldest first, each with two actions of which the primary is the safe default, and resolving a case writes the outcome to the audit log and notifies the player when the case concerned their account.

AD-25 (Must). A distress-pattern case requires a person to confirm within 24 hours that the "Someone to call" card was shown; the console never shows the note, and the case cannot be resolved by dismissal alone.

AD-26 (Must). Real-person demo accounts are listed with the M-PRIV-5 checks (public facts only, illustrative label, no photograph, roles not names) as pass or fail badges, and a failing check opens a case.

AD-27 (Should). Alerts are routed to push and email per role, with needs-action alerts always reaching at least one person in the role that owns them and a fallback to the owner after 30 minutes unacknowledged.

AD-28 (Should). Every admin can see their own action log; the owner can see every admin's.

AD-29 (Could). A read-only auditor role with Money and the audit log only.

AD-30 (Won't, Release 1). Impersonation (viewing the app as the player). Support works from the detail panel and the player's own audit log; if a case needs the player's view, the player shares a screenshot. Revisit if support volume proves it necessary, and then only with the player's consent per session and a banner in both views. Confirmed 13 September 2026 (A19).

AD-31 (Won't, Release 1). Editing player content of any kind (notes, drafts, profile text) from the console.

## 6. Data dictionary

Admin user:

| Field | Type | Source | Notes |
|---|---|---|---|
| id, name, email | string ×3 | owner grants | staff identity, separate from any player identity |
| role | enum support, ops, owner | owner | one role per person |
| passkeyRegistered | boolean | sign-in | mandatory before first use |
| grantedAt, revokedAt | timestamp | owner | revocation is immediate |

Audit entry (extends M-GATE-4):

| Field | Type | Notes |
|---|---|---|
| actor | enum player, agent, admin | admin entries carry adminId and role |
| action, target | string, entity reference | for example trial.extend on player p101 |
| reason | string, nullable | required for the actions in AD-5 |
| consequence | string | the one-sentence statement shown at confirmation |
| device, ip | string | as for player entries |
| notifiedPlayer | boolean | true when section 9 required a notification |

Case:

| Field | Type | Notes |
|---|---|---|
| kind | enum distress, report, guardian, governance | opened by rule |
| openedAt, openedBy | timestamp, rule id | never by a person in Release 1 |
| player | reference | the account concerned |
| excerpt | string | the tripping sentence or the report text, nothing more |
| dueAt | timestamp | 24 hours for distress |
| outcome, resolvedBy, resolvedAt | string, adminId, timestamp | written to the audit log |

Feed status: name, cadence, lastRunAt, lastResult, nextExpectedAt, rowCount, issues[], source. Import: file hash, rows, unmatched[], appliedAt, appliedBy, stageChanges. Correction: tournament, field, before, after, source, proposedBy, state. Agent health aggregate (nightly): agent, window, runs, successRate, p50, p95, costPerRun, approvalRate, dismissRate. Provider switch: provider, state, changedBy, reason, changedAt. Alert: kind, category act or fyi, title, body, link, roleOwner, acknowledgedBy.

## 7. Business rules and formulas

Approval rate: proposal-bearing runs with an `approvals` row inside 48 hours, divided by proposal-bearing runs, over a rolling seven days; the product alert fires when the rate is under 30 percent for 14 consecutive days (PRD-00 section 6). Dismiss rate: proposals explicitly dismissed (a pattern marked "not a pattern", a draft skipped, a brand rejected) divided by proposals.

Model spend per paying player: month-to-date model and API cost across all players, divided by the count of Pro and Elite players on the day, compared with 15 percent of the Pro monthly price (A$7.35). Elite forecast cost is shown separately per Elite player and excluded from the Pro figure. Alert at 80 percent of the cap.

Feed staleness: a feed is "Attention" when `now > nextExpectedAt + cadence`, and "Healthy" otherwise; weekend gaps in ECB rates are not staleness (Friday's rate is in force, and the card says so).

Retry policy: three attempts with backoff of 5, 20 and 60 minutes; the player is told after the third failure; a manual retry from the console resets the counter and is logged.

Kill-switch semantics: off pauses every dependent agent immediately and shows the same notice as an ops pause; patron payouts held by a switch are queued, not cancelled, and released in order on resume; nothing approved by a player is undone by any switch.

Role visibility: hidden areas are removed from the DOM and their routes fall back to Overview; the server enforces the same role on every API call, the client rule is a convenience.

Reason requirement: the confirming control for the actions in AD-5 stays disabled until the reason field is non-empty; the reason is stored verbatim and shown in the player's audit log.

## 8. Acceptance criteria

AD-AC-1. Given an admin with the support role, when they open the console, then Money and Ingestion are absent from the sidebar and tab bar, and navigating to `#/money` by URL lands on Overview.

AD-AC-2. Given support opens Arya Dubey's record and taps Extend trial 14 days, when the confirmation appears, then it states the new trial end date, and on confirming an audit entry with support's name and reason appears in both the console log and Arya's own Data & safety log, and Arya receives a notification.

AD-AC-3. Given the owner taps Delete account for a player, when the confirmation appears with an empty reason, then Start cooling-off is refused with an inline message; with a reason, the player's status becomes Deleting with a date 14 days out and the player is emailed at once.

AD-AC-4. Given a morning run for one player fails three times, when the console renders Agent health, then the run is listed with its error string and attempt count, the player has been told the run did not complete, and Retry re-queues it and resets the counter.

AD-AC-5. Given the Content Agent's approval rate has been under 30 percent for 14 days, when the nightly aggregation completes, then the agent's row shows Under threshold and an owner alert is raised.

AD-AC-6. Given the owner turns off transcription, when they click the switch once, then nothing changes and a prompt asks for a second click within five seconds; on the second click every agent depending on transcription pauses, Match Scribe shows a plain notice to players, and the switch change is logged with a reason.

AD-AC-7. Given the ITF calendar feed misses its 04:00 run and the next 04:00 run, when the console renders Ingestion, then the ITF calendar card shows Attention and a needs-action alert exists for ops.

AD-AC-8. Given ops loads a ranking CSV, when the preview renders, then each row shows the player's change and unmatched rows are listed, and Apply states how many stage changes will result; after applying, no player is notified before their next morning run.

AD-AC-9. Given a fact-sheet correction moves Bratislava's deadline a day earlier, when ops applies it, then the Tournament Agent re-runs for every player who shortlisted Bratislava and their countdowns update.

AD-AC-10. Given model spend per Pro player reaches A$5.88 (80 percent of the cap), when the Money page's daily figure updates, then an owner alert is raised.

AD-AC-11. Given a patron reports a Fan Agent answer, when the case opens, then the console shows the report text and the answer's rendered label state, never the conversation history, and Withdraw the answer is the primary action.

AD-AC-12. Given a distress-pattern case is open, when 24 hours pass without a person confirming the card was shown, then the case escalates to the owner by push and email and cannot be closed by Dismiss.

AD-AC-13. Given a real-person demo account fails a governance check (a photograph is added), when the nightly check runs, then a governance case opens and the account's badge turns to a fail state.

AD-AC-14. Given any admin action in the console, when it completes, then the corresponding audit entry contains actor admin, the admin's role, the consequence sentence shown at confirmation, and the reason where AD-5 required one.

## 9. Notifications produced

To the player: trial extended (with the new date), agents paused or resumed by staff, account deletion started by staff (email at once, with the cancel link), ranking re-verified by staff when the result changed, time-boxed access to note summaries granted (AD-10), case resolved when the case concerned their account. All are For-you category, one per action.

To staff (alerts sheet, and push or email by role): morning batch complete or failed (FYI to ops, needs-action if any run exhausted retries), feed missed its window (ops), case opened (support, with distress escalating to owner after 24 hours), guardian unconfirmed at 7 and 14 days (support), chargeback evidence due within 3 days (owner), model spend at 80 percent of cap (owner), reconciliation mismatch (owner), weekly sign-ups and conversions (FYI, everyone).

## 10. Sharing scope

The console shares nothing outward. Inward, the three roles are the scope model (section 2). No console data is exposed through coach or manager links, and a player's audit log shows admin actions but never the admin's contact details, only a name and role.

## 11. Analytics events

console_opened (role), player_searched (by), player_viewed, action_confirmed (action, role, hasReason), action_cancelled (action), run_retried (agent), agent_paused (agent, scope global or player), provider_switched (provider, state), feed_refreshed (feed), snapshot_applied (rows, stageChanges), correction_applied (field), deadline_set, case_opened (kind), case_resolved (kind, outcome, hours open), alert_acknowledged (kind, minutes to ack), role_previewed (role). Product KPIs: median hours a case stays open (target under 24 for distress, under 72 otherwise), share of support actions completed without engineering help (target above 95 percent), minutes from a feed missing its window to acknowledgement (target under 60), share of admin actions with a reason where required (target 100 percent, a hard rule not a KPI).

## 12. Out of scope and open questions

Out of scope for Release 1: impersonation (AD-30); editing player content (AD-31); building billing, email logs or infrastructure metrics inside the console (Stripe, Resend and Grafana are linked, not rebuilt); customer-facing status page; bulk messaging to players from the console (a product announcement goes through the normal notification system as an FYI, authored outside this surface); the auditor role (AD-29).

Settled 13 September 2026: separate hostname on the same codebase (A18); no impersonation in Release 1 (A19); model spend per player visible to all console roles, accepting that it reveals how heavily a player uses Match Scribe (A20). Open questions: whether the distress-case 24-hour confirmation needs a named on-call rotation from day one or can rest with the owner while there are under a thousand players. Whether fact-sheet corrections should be proposable by players from the tournament detail ("this is wrong") rather than only by support. Whether the 80 percent spend alert should be per player as well as in aggregate, to catch a single account driving cost. Whether the ranking CSV import path is acceptable to the ATP and ITF licensing terms as a fallback, which TECH-ARCHITECTURE section 4 flags as the project's largest commercial risk.

Inconsistencies with PRD-00 to resolve before build: PRD-00 section 2 lists no staff actor and section 5.7 no staff roles; this document adds both and PRD-00 should be amended. M-GATE-4 records agent runs and player approvals; it does not mention staff actions, and this document's AD-4 and AD-5 are stricter (a required reason) than anything PRD-00 asks of players or agents, which is deliberate but should be stated in the master. M-PRIV-1 and the audio retention question (A3) affect what the console can ever show: if audio is kept 90 days, the console must still never play it (AD-6), and that should be said in M-PRIV-1 rather than only here. The Money page's fee tile depends on A1 and A2; until they are decided the tile shows the assumed 8 percent on gross with the decision flagged, which is the prototype's current state.
