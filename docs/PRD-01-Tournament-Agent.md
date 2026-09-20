# PRD-01 · Tournament Agent

Version 0.2 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/agent/tournament` (shortlist, detail, calendar, memo), the decision card on `#/` and the Decision tile, the Schedule and shortlist card on `#/coach`, and the Conditions brief inside the detail panel (behaviour of the brief itself is specified in PRD-08 and only referenced here).

---

## 1. Purpose and job to be done

When a player sits down on a Sunday night to decide which of the next six weeks to enter, they are weighing prize money, ranking points, entry deadlines, acceptance odds, flights, hotels, a coach's fee, points they are about to lose, and how much cash they have left. Today this is done in a spreadsheet, a WhatsApp thread and a gut feeling. The Tournament Agent does the arithmetic and the reading every week, ranks the realistic options by cost-to-prize, tells the player which one needs a decision this week and why, and then gets out of the way: entering, skipping and withdrawing are the player's taps.

Job statement: "Every week, show me the five events worth considering in the next six weeks, what each one costs me to reach, what I stand to make and defend, and which decision is due first, so that I never miss a deadline and never enter a week that empties the account."

Success: the player makes each entry decision before the deadline with the cost and runway effect in view; the approval rate of the agent's top pick is above 50 percent; missed deadlines fall to zero.

## 2. Users and entitlements

Player on Pro or Elite: full agent. Player on Free: the shortlist renders with names, tiers, dates and deadlines only; cost, outcome and runway columns show the locked state (M-TIER-1). Coach via share link: shortlist, decisions and agenda, no money (M-SHARE-1). Manager via share link: planned entry costs appear in the ledger they can see, not the shortlist itself.

Stage and tour affect scope (PRD-00 section 3, M-STG-3). Men: Stage 1 scans ITF M15 and M25; Stage 2 scans ITF M25 and Challenger 50 to 75 plus Challenger 100 qualifying; Stage 3 scans Challenger 50 to 125 and ATP 250 qualifying. Women: Stage 1 scans ITF W15 and W35; Stage 2 scans ITF W35 to W100 and WTA 125 qualifying; Stage 3 scans WTA 125, ITF W100 and WTA 250 qualifying. The outcomes table shows singles rounds only in Release 1; a doubles line (prize by round, player's share) is Release 2 with the partner model.

## 3. Agent contract

Trigger. Scheduled every Sunday 20:00 UTC (player-adjustable in Settings > Agents; Elite can set any cadence in Agent Studio). Also on demand by "Re-run now" (rate limited to one manual run per hour; the UI says "results in about 2 minutes"). Also automatically whenever a ranking snapshot changes the player's position by more than 15 places, or a tournament in the current shortlist changes its acceptance list or deadline.

Inputs. Verified ranking snapshot with points by tournament and expiry weeks; the ATP and ITF calendars for the next eight weeks with tiers, surfaces, cities, dates, entry deadlines, prize and points tables and last year's acceptance cut; the player's blocked dates and weekly travel budget; the player's home airport and coach arrangement (per-week fee, travel or not); the player's surface record for the season; current reserves and burn from the Financial Agent; the current shortlist's decision statuses; cost model priors (flight and accommodation estimates by city and week, learned from the player's own ledger where available, otherwise from platform medians); the Conditions brief for each candidate (PRD-08).

Outputs. A ranked shortlist of exactly five candidates (fewer only if fewer than five pass the filters, in which case the reason is stated), each with: cost breakdown, outcome table by round, expected net, best and worst case, acceptance status and cut, points defended, an explanation paragraph ("why"), and a Conditions brief. A list of considered-and-excluded events with one-line reasons. A recommendation memo (300 to 500 words) narrating the shortlist. Exactly one For-you notification when a deadline falls inside the coming seven days, otherwise one FYI notification that the shortlist is ready.

Approval gate. The agent never enters, withdraws or pays. "Accept entry" is a two-step control (Accept, then Confirm with the planned expense and runway effect stated). On confirmation the app logs a planned expense in the ledger and marks the tournament Entered; the actual entry on the ITF or ATP player zone remains the player's action in Release 1, and the app shows a checklist item "Enter on the player zone by Thu 18 Sep 23:59 CET" with a link. Automatic submission to the player zones is Won't for this release and an open question for Release 2.

Failure behaviour. If any feed is unavailable the run completes with what it has and labels the affected fields "not refreshed" with the last-good timestamp. If the run cannot complete at all, the previous shortlist stays visible with a banner "Sunday's run didn't complete; showing last week's list" and a Re-run action. Low-confidence cost estimates (no ledger history and no platform median within 30 percent) are marked with a tilde and a tooltip.

Audit. Each run records trigger, input snapshot hash, model and prompt version, the structured output (validated against the shortlist schema; a validation failure is a failed run), and cost. Each decision records the player, timestamp, device, and the planned cost at the moment of confirmation.

Cost. Target under A$0.40 per run on Pro; the memo is generated once per run, not on every view.

## 4. Surfaces and states

### 4.1 Tournament Agent page (`#/agent/tournament`)

Header: title, run summary ("Weekly shortlist for weeks 40 to 45, ranked by cost-to-prize. Ran Sun 6 Sep 20:00 UTC · next run Sun 13 Sep"), Budget chip (weekly travel budget, opens Settings), Blocked dates chip with count, Re-run now.

KPI row: Events scanned (count and scope), Shortlisted (5, "within budget, no blocked dates"), Deadline this week (count and the nearest event and date, amber when non-zero), Decisions (n of 5, sub-line "e entered · s skipped" or "nothing entered yet").

Tabs: Shortlist, Calendar.

Shortlist list: five rows ordered by rank with rank number, flag and name, status badge (Decide when the deadline is within 10 days and no decision; Pending; Entered; Skipped), meta line (tier, surface, dates), "closes in Nd" (amber within 10 days), and a bar showing 1 minus the cost-to-prize ratio with the ratio value. Below the list: "Also considered · N excluded" expanding to the exclusion list. Selecting a row loads the detail; on screens narrower than 1180px the detail scrolls into view.

Detail panel: header (name; tier, surface, flag, city and country, dates; status badge or "Entry closes <date>"), chips (Week n, acceptance status and cut, "Defending N pts" in amber when applicable), the why paragraph, two columns: cost breakdown (Flights with route line, Accommodation with nights, Coach block when non-zero, Entry fee when non-zero, Cost to go in red) and the outcome table (Result, Prize, Points, Net per round). Then the Conditions brief (PRD-08). Then the Net outcome range rail (worst to best, expected marker, zero line) and the footer: Accept entry and Skip with the deadline; or the confirm step; or the Entered footer with Withdraw; or the Skipped footer with Undo.

Calendar tab: eight week columns (current week first) with Monday dates; one row per shortlisted event; a bar in the event week labelled with tier and "def N" when defending; a deadline marker in the deadline week when undecided; blocked weeks shaded across all rows; a final row for the player's blocked dates.

Recommendation memo card: timestamp, provenance line (model and validation), narrative.

States: loading (skeleton rows and a spinner in the KPI row); fresh run available (banner "New shortlist from Sunday's run" when the page was open during a run); run failed (banner with last-good list); Free tier locked columns; empty (Stage unverified: "Verify your ranking to get a shortlist"); all decided (Decisions 5 of 5, the KPI turns green and the next-run line is emphasised).

### 4.2 Dashboard decision card (`#/`)

Shows the single top pick that has the nearest undecided deadline. Title "This week's decision · <event>", the deadline badge in days, the run line ("Tournament Agent's top pick of five, ranked by cost-to-prize. Entry closes Thu 18 Sep, 23:59 CET"), chips (flag and city, tier, surface, dates, departure airport, the Conditions chip), cost to go, Lose R1 and Reach QF outcomes with arrows to net, points on offer, the Net outcome range rail, and two runway tiles: runway if you lose R1 and runway if you reach QF (fed by the Financial Agent). Actions: Accept entry (goes to the confirm step on the agent page) and Withdraw (only when Entered). When all shortlisted deadlines are decided the card shows the next deadline as "Nothing due this week · next: <event>, <date>".

### 4.3 Decision tile (`#/`)

"Decision required" with days to the nearest undecided deadline, event name and "confirm or withdraw by <date>", a progress bar of time elapsed since the run. Badge "Entry deadline" (amber inside 10 days).

### 4.4 Coach view (`#/coach`)

Schedule and shortlist agenda: week, flag and event, one-line note (defending points and deadline, or "filler week"), status badge (Shortlist, Entered, Skipped). No money.

## 5. Functional requirements

T-1 (Must). The agent scans every event in the player's stage scope whose first day falls within the next eight weeks and whose entry deadline has not passed.

T-2 (Must). Filters applied before ranking, each producing an exclusion reason: overlaps a blocked date; estimated cost to go exceeds the weekly budget; the player is outside last year's acceptance cut by more than 40 places and there is no qualifying; the event overlaps another shortlisted event in the same week (the better-ranked one stays); surface the player has excluded in Profile.

T-3 (Must). Candidates are ranked by cost-to-prize ratio (section 7), with ties broken by points defended (higher first) and then by expected net.

T-4 (Must). A points-defence week is always shortlisted if it passes the blocked-dates filter, even if its ratio would rank it outside the top five, and its why paragraph states the points that drop and the ranking places at risk.

T-5 (Must). Each candidate shows the cost breakdown lines flights, accommodation, coach, entry fee, and the total, with the flight route line (origin, stops, duration).

T-6 (Must). Each candidate shows an outcome table with one row per round from the first realistic round for the player (Q1 when qualifying is likely, R1 when direct acceptance) to the semi-final, with prize, points and net.

T-7 (Must). Each candidate shows expected net, worst case and best case, and these three values drive the Net outcome range rail.

T-8 (Must). Acceptance status is one of Direct acceptance (with last year's cut), Alternate list (with the cut and the player's position), Qualifying likely (with the main-draw cut), stated in a chip.

T-9 (Must). Accept entry requires a second confirmation that states the planned cost and the runway after an R1 loss; confirmation logs a planned expense line attributed to the tournament and sets status Entered.

T-10 (Must). Skip sets status Skipped with the footer text "Skipped. The agent will drop it from next week's run." and offers Undo until the next run.

T-11 (Must). Withdraw is available while Entered and before the deadline; it removes the planned expense and sets status Withdrawn (shown as Skipped in the list); after the deadline the footer says withdrawal must be done on the player zone and offers the link.

T-12 (Must). Deadline countdown badges turn amber at 10 days and the status badge reads Decide; inside 24 hours the badge turns red and the notification ignores quiet hours (M-NOTIF-2).

T-13 (Must). Re-run now queues a run, disables the button, shows "Re-run queued · results in about 2 minutes", and replaces the list in place when done, preserving the player's decisions.

T-14 (Must). Decisions persist across runs; a re-run may re-rank but never clears Entered or Skipped, and a shortlisted event that a later run would exclude stays visible with its decision and an "excluded next week" note.

T-15 (Must). The recommendation memo is generated per run, cites the same numbers as the shortlist (no divergence), and never recommends an action the gate forbids (it says "accept before Thursday", not "I have entered you").

T-16 (Must). The dashboard decision card and Decision tile always reflect the nearest undecided deadline among shortlisted events, updating immediately on any decision.

T-17 (Must). The Calendar tab shows blocked weeks, event weeks and deadline weeks for the shortlist across eight weeks.

T-18 (Must). The Conditions brief for each candidate is embedded in the detail (PRD-08) and one Conditions chip appears on the dashboard decision card.

T-19 (Should). Cost priors learn from the player's ledger: after three tournaments with actuals, city and week estimates use the player's median with the platform median as fallback, and the detail shows "based on your last N trips".

T-20 (Should). The player can pin an event not in the shortlist ("Add an event") and the agent computes the same breakdown for it on the next run.

T-21 (Should). Excluded events list shows the reason and a "Consider anyway" action that pins the event.

T-22 (Could). Flight and accommodation estimates link out to a search pre-filled with dates and city.

T-23 (Won't, Release 1). Automatic submission of entries to the ITF or ATP player zones.

## 6. Data dictionary

Tournament candidate (one per shortlisted event, produced per run):

| Field | Type | Source | Notes |
|---|---|---|---|
| id | string | platform | stable per event edition |
| rk | integer 1..5 | agent | rank in shortlist |
| name, tier, surface, indoor | string | calendar feed | tier examples ITF M25, CH 75, CH 100, CH 125 |
| city, country | string | calendar feed | country as IOC code for the flag sprite |
| dates, wk, dlWk, deadline, days | date, int, int, date, int | calendar feed, computed | days until deadline at run time |
| ratio | decimal | agent | cost-to-prize, section 7 |
| flights, stay, coach, entry, nights | money in home currency | cost model | each with an estimate confidence |
| route | string | cost model | "VIE → POZ via WAW · 1 stop · 4h 10m" |
| defend | integer points | ranking snapshot | points expiring in this week from last year's result |
| rounds | array of [label, prize, points] | prize and points tables | from first realistic round to SF |
| exp, lo, hi | money | agent | expected, worst, best net |
| cut | string | acceptance list | acceptance status text |
| cond | object | PRD-08 | brief for the event |
| why | rich text | agent | one paragraph, one bold clause allowed |
| status | enum none, entered, skipped, withdrawn | player | persisted decision |
| plannedExpenseId | string | ledger | set on Entered |

Run record: id, trigger (schedule, manual, ranking-change, calendar-change), startedAt, completedAt, inputsHash, model, promptVersion, scannedCount, excluded [{eventId, reason}], memo, cost.

## 7. Business rules and formulas

Cost to go = flights + accommodation (nights × nightly estimate) + coach fee for the week + entry fee. Accommodation nights default to 7 for a main-draw event and 9 when qualifying is likely.

Net for a round = prize for that round minus cost to go. Prize values use the event's published prize table converted to home currency at the run-date rate, shown as such.

Expected net = Σ over rounds of P(reaching exactly that round) × net(round). Round probabilities come from the player's twelve-month record at that tier and surface, smoothed toward the platform prior for the player's ranking band; the model version is recorded on the run. Worst case = net of the first realistic round. Best case = net of the semi-final row.

Cost-to-prize ratio = cost to go ÷ (expected gross prize + points value), where points value converts expected points into money using the player's stage constant (Release 1: A$60 per ATP point, adjustable per stage in configuration). Lower is better; the list bar shows 1 minus ratio.

Deadline states: Pending when more than 10 days remain; Decide when 10 days or fewer remain and no decision; red when 24 hours or fewer remain.

Acceptance: Direct acceptance when the player's ranking is inside last year's cut minus 10 places; Alternate list when within 40 places outside the cut; Qualifying likely otherwise where qualifying exists; excluded otherwise.

Points defence: an event is a defence week when the player holds points from the same event edition last year that expire in that week; the why paragraph must state the points and the estimated places lost if skipped (computed from the current ranking table).

Runway after R1 loss (shown on confirm and on the decision card) = (reserves + net of R1) ÷ weekly net burn, from the Financial Agent's current figures.

## 8. Acceptance criteria

T-AC-1. Given the Sunday run has completed for Arya (Stage 2, budget A$1,200/wk, blocked 26 Oct to 1 Nov), when she opens `#/agent/tournament`, then five events are listed, none in week 44, none with cost to go above A$1,200 excluding the defence week, and Poznań is ranked first with ratio 0.42.

T-AC-2. Given Sibiu is a defence week holding 20 points that expire 9 Oct, when the shortlist is computed, then Sibiu appears in the shortlist regardless of ratio and its why paragraph contains "20 points" and the places at risk.

T-AC-3. Given Poznań's deadline is 6 days away and undecided, when the dashboard renders, then the Decision tile shows "6 days", the badge is amber, and the decision card names Challenger Poznań.

T-AC-4. Given Poznań is selected and undecided, when the player taps Accept entry, then a confirm step appears stating "A$1,360 logged as a planned expense" and the runway after an R1 loss, and nothing is written until Confirm is tapped.

T-AC-5. Given the player confirms, when the ledger is viewed, then a planned expense of A$1,360 attributed to Challenger Poznań exists, Poznań shows Entered in the list and calendar, the Decisions KPI reads "1 of 5 · 1 entered · 0 skipped", and a checklist item to enter on the player zone by the deadline appears.

T-AC-6. Given Poznań is Entered and the deadline has not passed, when the player taps Withdraw, then the planned expense is removed, the status becomes Withdrawn and a toast confirms it.

T-AC-7. Given Antalya is Skipped, when the next run completes, then Antalya is absent from the new shortlist and the Skipped record remains in the audit log.

T-AC-8. Given the ATP feed is unavailable at run time, when the run completes, then the shortlist renders with acceptance chips marked "not refreshed · last good Sun 30 Aug" and the run is not marked failed.

T-AC-9. Given the player taps Re-run now, when less than one hour has passed since the last manual run, then the button is disabled with a tooltip stating when it becomes available.

T-AC-10. Given the player's home currency is CNY, when the detail renders, then every money value including the outcome table and the Net outcome rail labels is shown in ¥ with the run-date rate available on hover.

T-AC-11. Given the coach opens the coach link, when the agenda renders, then events, weeks, statuses and defence notes are visible and no money value appears anywhere on the page.

T-AC-12. Given a Free player, when they open the agent page, then names, tiers, dates and deadlines render and cost, outcome and rail areas show the locked state with one "Start Pro trial" action.

T-AC-13. Given the viewport is 390px wide, when the player selects a shortlist row, then the detail scrolls into view, no element exceeds the viewport width, and Accept entry and Skip are reachable without horizontal scrolling.

T-AC-14. Given the memo has been generated, when it is compared with the shortlist, then every number in the memo (costs, prizes, points, dates) matches the shortlist values for that run.

## 9. Notifications produced

For you: "<Event> entry closes in N days" with body "Top pick of five. Cost −A$1,360, R1 cheque +A$1,620. Confirm or withdraw." and action Open (at 7 days, 3 days and 24 hours; the 24-hour one ignores quiet hours). FYI: "Weekly shortlist ready" after each scheduled run; "Shortlist changed" when an automatic re-run alters the top pick; "Sunday's run didn't complete" on failure.

## 10. Sharing scope

Coach: shortlist, statuses, agenda, defence notes, why paragraphs, Conditions briefs. Manager: planned expenses in the ledger only. Public profile: the next Entered event as "Next: <event> · <surface>" once the player marks it public.

## 11. Analytics events

shortlist_run_completed (trigger, scanned, shortlisted, cost), shortlist_viewed, candidate_selected (rank), entry_accept_started, entry_confirmed (rank, plannedCost, daysToDeadline), entry_skipped (rank, reason if given), entry_withdrawn, rerun_requested, memo_expanded, excluded_list_opened, calendar_tab_viewed. Product KPIs: top-pick approval rate, decisions made before deadline (target 100 percent), median days-before-deadline at decision, planned-versus-actual cost error (target under 15 percent after three trips).

## 12. Out of scope and open questions

Out of scope for Release 1: automatic entry submission; doubles draws, partners and doubles shortlists (the doubles ranking chip and doubles prize money are in scope through PRD-00 M-STG-4 and PRD-03); team events; hotel and flight booking; visa and travel-document tracking; prize-money tax modelling beyond the withholding field in the Financial Agent.

Open questions: whether Stage 3 players want ATP 250 qualifying in scope by default or opt-in; the points-value constant per stage (A$60 per point is a placeholder for review with players); whether the weekly budget should be a hard filter or a soft penalty in the ranking; whether the coach should be able to comment on a candidate inside the app in Release 1; how to source acceptance lists reliably for ITF events where the cut is published late.
