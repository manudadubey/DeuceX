# PRD-03 · Financial Agent

Version 0.3 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/agent/financial` (KPI row, Reserves and runway chart with scenarios, One thing to do this week, Budget vs actual, Where reserves come from, Monthly P&L, Ledger with receipt scanning), the Runway pulse tile and runway-after tiles on `#/`, the Financial Agent, Bank and Parent / manager rows in Settings, and step 3 on `#/first-week`. Planned expenses come from PRD-01 and patron payouts from PRD-04; both are only consumed here.

---

## 1. Purpose and job to be done

A player at Arya's level has no accountant and no bank feed. She has receipts in three currencies, a Genoa cheque that may arrive in October, and a Challenger next week that costs A$1,360 to reach. The question she asks is not "what did I spend" but "how long does the money last, and does Poznań change that". The Financial Agent answers it every morning and on every logged expense, in weeks rather than dollars, then names the single thing worth doing about it.

The page description is the promise: "Runway, P&L and the one thing to do about it." Job statement: "Every morning, tell me how many weeks of cash I have at this week's burn, what the next tournament does to that number if I lose early or go deep, and the one action that adds the most runway, so that I never enter a week that empties the account."

Success: 80 percent of players update the balance weekly; 70 percent of expense lines are scanned within 48 hours; planned-versus-actual error falls under 15 percent after three trips (shared with PRD-01); the "one thing" action is opened or snoozed rather than ignored in 60 percent of runs.

## 2. Users and entitlements

Player on Pro or Elite: the full agent. Player on Free: the layout renders with sample data, a lock badge and one "Start Pro trial" action (M-TIER-1); nothing can be entered or saved. Parent or manager via share link: runway, reserves, P&L, expenses with receipt thumbnails and patron income (M-SHARE-2); Settings > Sharing says "Sees runway, P&L, expenses and patron health. No agent outputs, no notes." Coach via share link: nothing from this agent, ever (M-SHARE-1); `#/coach` carries the pill "✗ Money". Under-18 players: the guardian holds the manager link by default (M-ID-3).

Downgrade to Free (M-TIER-2) keeps the ledger, receipts, receivables and balance history readable and exportable while scanning, entry and the daily run stop: "Downgrade takes effect 3 Oct · Financial and Mindset pause, nothing is deleted."

## 3. Agent contract

Trigger. Scheduled daily at 07:00 UTC (Settings > Agents also offers "Monday only"; Elite sets any cadence in Agent Studio). Also immediately on every saved expense (manual, scanned or a planned line from PRD-01), every balance update and every receivable marked received; live runs recompute figures without regenerating the action. Also on every shortlist change.

Inputs. Balance entries; the ledger with original currency, locked ECB rate, category, tournament and source; planned expenses from Entered tournaments; prize receivables with gross, withholding, paying currency, expected date and status; patron MRR and the Stripe payout log; the weekly travel budget; the current top pick with cost to go and round outcomes.

Outputs. Runway in weeks with its colour; net burn and gross spend; a fourteen-week projection per scenario, cash only and with pending prize; the zero-cash week; budget versus actual per tournament; the month's income and spend; exactly one "one thing to do this week" action with its runway effect in weeks; the next-milestone line; one notification per scheduled run.

Approval gate. The agent moves no money and has no external action to take. Its writes are proposals the player confirms: an extracted receipt counts only on Save ("Check what was read · nothing counts until you save"); a balance changes only on Update; a receivable enters reserves only when marked received (M-DATA-2). The "one thing" card deep-links to another agent's gate ("Open the draft" to PRD-05) or snoozes; it never performs the action (M-GATE-1). The effect sentence sits beside each save: "updates runway the moment you save" (M-GATE-2).

Failure behaviour. If the scheduled run fails, yesterday's figures stay with the sub-line "Yesterday's figures · this morning's run didn't complete" and a matching FYI notification. An unpublished ECB rate saves as provisional and is re-rated once, both rates audited. If extraction fails or exceeds 10 seconds, the item opens as a blank form with "We couldn't read this one. Type it in or skip it." If no top pick is undecided, the scenario control collapses to No entry.

Audit. Each run records trigger, inputs hash, model and prompt version, the structured output validated against the finance schema (a failure is a failed run) and cost. Each scan records raw fields and confidences, flagged fields, the player's edits and the rate used. Each balance update records previous and new values, time and device (M-GATE-4).

Cost. Under A$0.10 per scheduled run (one short generation; the rest is arithmetic) and under A$0.02 per receipt ("GPT-4o mini · structured extraction · usually 2–3 seconds").

## 4. Surfaces and states

### 4.1 Financial Agent page (`#/agent/financial`)

Header: month selector `#finMonth`, Export, Enter manually `#addXBtn`, Scan receipt `#scanBtn` bound to a hidden multi-file camera input.

KPI row: Runway `#kRunway` ("8.3 wks", amber, bar at 41.5 percent of a 20-week scale, sub-line "Amber · under 10 weeks"); Reserves `#kReserves` ("A$9,450", "A$1,140/wk net burn", tooltip "Cash you've entered, not a bank balance."); September so far `#kNet` ("−A$2,140", "A$1,500 in · A$3,640 out"); Patron MRR ("A$612 +A$98", "covers 11% of weekly spend").

Reserves and runway card: "Twelve weeks behind you, fourteen ahead. Pick a scenario to see what Poznań does to the line."; scenario tabs No entry, "Poznań · lose R1", "Poznań · reach QF" with the badge `#scenNote`; the chart `#runChart` from `drawRunway` (solid history, dashed cash-only projection, dotted green with-pending line, bands at 10 and 4 weeks of burn); tiles `#kZero` ("Week 45 · 8 Nov"), `#kFour` ("9.1 wks · Genoa cheque 3 Oct"), `#kAlarm` ("Red in 4.3 wks" or "Red now").

One thing to do this week card: badge "07:00 UTC"; the action in bold, "Publish the patron update before Poznań."; an optional second sentence; the Next milestone bar ("MRR covers 15% of spend", 73 percent, "11% today · A$192/wk needed · at current growth: mid-November"); footer Open the draft (to `#/agent/content`) and Not this week (toast "Snoozed until Monday 07:00").

Budget vs actual card: badge "Budget A$1,200/wk"; the weekly bar (`#wkSpent`, `#wkBar`, `#wkSub`); the table `#estact` from `renderBudget`, one row per `EST` entry with estimate and actual bars and a signed variance or "not started"; the line "The agent learns from the gap: Italian car hire now estimated +40%, apartments −11%."

Where reserves come from card: `#balStamp`; "Cash · entered by you" `#balV`; input `#balIn` with Update `#balSave`; the pending step "Pending prize · A$890 · Genoa Q2 · expected Fri 3 Oct · not counted as cash"; the switch `#balRemind` "Remind me to update every Sunday at 20:00"; the statement "No bank connection. ProCircuit never holds your login or card details; the only money data stored is what you type or scan here."

Monthly P&L card: chart `#plChart` from `drawPL`, six months of income, spend and net.

Ledger card: tabs Expenses, Prize income, Patron MRR; entry panel `#addX` with sub-states `#axScan` (Take photo, Choose photos, Try with sample receipts), `#axProc` ("Reading receipt") and `#axForm` (thumbnail, `#axQueue`, Retake, `#axTitle`, fields Amount with FX line `#axFx`, What, Category, Tournament, Date, each with a hidden "Check" badge, Skip this one `#xSkip`, Cancel, Save); the table `#ledger` from `renderLedger` with a receipt button per scanned line.

States: loading; fresh; live-updated (a `.fresh` row and a toast); scenario selected; run failed; rate provisional; receipt processing, review, flagged, failed; batch in progress; over budget; receivable overdue; no balance yet; Free locked.

### 4.2 Dashboard (`#/`)

Runway pulse tile: tooltip "How many weeks your cash lasts at this week's net burn (spend minus patron income). Green over 10 weeks, amber under 10, red under 4.", badge "Under 10 weeks", value "8.3 weeks" and the reserves and burn sub-line. The decision card tiles "Runway if you lose R1 · 8.5 wks" and "Runway if you reach QF · 10.5 wks" are computed here.

### 4.3 First-week state and onboarding

Runway tile in grey: "Enter today's cash balance and the Financial Agent runs tomorrow at 07:00. Takes a minute."

### 4.4 Settings (`#/settings`)

Agents row "Financial Agent · GPT-4o · daily, plus live on each expense" with schedule select and pause switch. Connections row "Bank · Not offered. Balances are entered by you; receipts are scanned. ProCircuit never holds bank logins." badged "By design".

## 5. Functional requirements

F-1 (Must). The agent runs daily at 07:00 UTC and recomputes runway, burn, projections and month figures, and again within two seconds of any saved expense, balance update or receivable status change.

F-2 (Must). Reserves are typed by the player; the app never connects to a bank or asks for bank credentials, and says so on the reserves card and in Settings > Connections.

F-3 (Must). Updating the balance requires a non-zero amount and a tap on Update, records previous and new values with a timestamp, redraws the chart and toasts "Balance updated <signed difference> · runway now <n> wks".

F-4 (Must). A Sunday 20:00 local FYI reminder to update the balance is sent while the switch is on (default on) and respects quiet hours.

F-5 (Must). Runway is reserves divided by weekly net burn, shown to one decimal with green at 10 weeks or more, amber under 10 and red under 4, identical on the KPI tile, the dashboard tile and the daily notification.

F-6 (Must). The projection covers fourteen weeks at the current net burn, drawn cash only and with pending receivables in their expected week; the pending line never counts toward the reserves or runway tiles.

F-7 (Must). The scenario control offers No entry plus one scenario per realistic outcome of the current top pick (lose R1, reach QF), each applying the planned cost in the event week and the round's net prize in its expected week.

F-8 (Must). Selecting a scenario re-renders runway and the three outcome tiles, and the runway sub-line shows the difference against No entry ("+0.2 vs no entry").

F-9 (Must). A prize receivable is created from results with gross, withholding and net in the paying currency, stays in that currency as Pending until the player marks it received, and only then enters reserves as a realised income line at that day's ECB rate (M-DATA-2). A doubles result creates a receivable for the player's share only (default 50 percent of the team prize, editable per event), labelled "doubles" in the ledger and the prize table, and it counts toward runway exactly as a singles prize does (PRD-00 M-STG-4).

F-10 (Must). Every expense stores amount and currency as spent, the ECB rate on the transaction date and the home-currency amount; the rate is locked at save and switching home currency changes only the display (M-DATA-1, M-CUR-1).

F-11 (Must). Manual entry offers Amount, What, Category (Travel, Accommodation, Coaching, Equipment, Food, Physio, Entry fees, Other), Tournament (None plus current and shortlisted events) and Date; Save without an amount is refused.

F-12 (Must). Scanning accepts a camera capture or several library photos, queues them, processes one at a time with the position shown, and opens each for review with pre-filled fields and the FX line with original amount, rate and date.

F-13 (Must). Fields below the confidence threshold carry a "Check" badge and an amber border, the toast states the count, and a flagged field does not block Save.

F-14 (Must). In a batch, Skip this one appears when more than one receipt is queued and advances without saving; Cancel discards the queue; Save writes the line, recomputes, toasts the new runway and opens the next receipt.

F-15 (Must). Receipt photos are read once and deleted after extraction; the ledger keeps a rendition and card numbers are redacted before storage (M-PRIV-1).

F-16 (Must). Budget vs actual shows, per estimated tournament, the estimate, the sum of attributed expenses and a signed variance percentage, or "not started"; rows over estimate are amber.

F-17 (Must). The weekly budget bar sums expenses dated Monday to Sunday of the current week against the budget, turns amber above 80 percent and red when over, and when over reads "<amount> over budget · the agent will trim next week's shortlist" and passes the overrun to the Tournament Agent.

F-18 (Must). Each scheduled run produces exactly one "one thing to do this week" action naming a step the player can take within seven days, its runway effect in weeks and a link to where it is taken; "Not this week" snoozes it until Monday 07:00; a second sentence carries no control.

F-19 (Must). The Monthly P&L shows six months of received prize income after withholding, patron payouts after fees, spend and net; pending receivables and gross MRR are excluded.

F-20 (Must). Export produces a CSV of the selected month or season with original currency, rate, home amount, category, tournament and source per line.

F-21 (Should). After three tournaments with actuals the agent publishes per-category adjustment factors to the Tournament Agent's cost priors.

F-22 (Should). A receivable seven days past its expected date turns red and raises one For-you notification with actions to mark received or edit the date.

F-23 (Won't, Release 1). Bank or card aggregation, tax filing exports, invoicing, multi-account reserves, and automatic prize detection from bank data.

## 6. Data dictionary

Expense line (owned here; planned lines written by PRD-01; read by PRD-01 for priors and by the manager link):

| Field | Type | Source | Notes |
|---|---|---|---|
| id | string | platform | stable |
| d | date | player, extractor | shown "11 Sep" |
| what | string | player, extractor | merchant for scans |
| cat | enum of eight categories | player, extractor | F-11 |
| t | tournament id or None | player, extractor | drives budget vs actual |
| amtOrig, cur | decimal, ISO 4217 | extractor, player | "€38,50", EUR |
| rate, rateDate, rateSource | decimal, date, enum ecb, provisional | platform | locked at save |
| a | money in home currency | computed | amtOrig × rate |
| source | enum manual, scanned, planned | platform | |
| rcpt | string or null | platform | rendition, never the photo |
| unsure | array of field names | extractor | flagged at review |
| edits | array of {field, proposed, saved} | platform | audit |
| fresh | boolean | platform | true until the next run |

Balance entry: id, amount, enteredAt, device, previous, cause (player, receivedPrize). Prize receivable (`PZ`, `PENDING`): tournament, round, date, gross, withholding, cur, expectedDate, status Pending, Received, NoPrize, receivedAt, realisedRate, realisedAmount. Estimate (`EST`): tournament, est, estimatedAt, status. Scenario: key (base, r1, qf), events [{week offset, delta, label}]. Run record: trigger, inputsHash, reserves, burn, runway by scenario, zeroWeek, action {text, effectWeeks, href, snoozedUntil}, milestone {target, current, needed, eta}, model, promptVersion, cost.

## 7. Business rules and formulas

Weekly patron income = gross MRR × 12 ÷ 52 (A$612 gives A$141). Gross weekly spend = trailing four-week average of logged expenses including planned lines whose week has begun (placeholder; the prototype fixes A$1,281). Net burn = gross spend − patron income (A$1,140). Coverage = patron income ÷ gross spend (11 percent).

Runway = reserves ÷ net burn (9,450 ÷ 1,140 = 8.3). Green at 10 or more, amber under 10, red under 4.

Projection: for weeks 1 to 14, reserves(w) = max(0, reserves(w−1) − burn + Σ scenario deltas in w + Σ pending receivables in w when drawing the with-pending line). If the projection reaches zero in week i, runway = (i − 1) + reserves(i−1) ÷ (burn − inflows in week i); otherwise runway = 14 + reserves(14) ÷ burn. Zero week = current week + runway; zero date = today + runway × 7 days.

Scenarios take the top pick's planned cost as a negative delta in the event week (Poznań: −A$1,360 in week 40) and the round's net prize as a positive delta in its expected week (R1: +A$1,620 in week 41; QF: +A$3,900 in week 42), giving 8.5 and 10.5 weeks for Arya.

Receivables stay in the paying currency until marked received; the realised amount uses the ECB rate on the received date and writes an income line plus a balance entry with cause receivedPrize. Overdue means 7 days past expectedDate.

Receipt schema (version 1): merchant, amount, currency, date, category from the enum, tournament or None, and a confidence per field; a field is flagged under 0.8 (placeholder). Home amount = amount × ECB rate on the receipt date, rounded to the unit (€38,50 × 1.651 = A$64).

Budget vs actual: variance = (actual − estimate) ÷ estimate as a signed whole percentage (Genoa est A$1,900, actual A$2,425, +28 percent; Sibiu est A$960, actual A$130, −86 percent). Weekly budget: amber above 80 percent of budget, red above budget.

Month figures: in = received prize net of withholding + patron payouts received; out = expenses dated in the month; net = in − out (so September "in" is A$612 until the Genoa cheque lands).

The action is the top of a ranked candidate list (publish a pending patron update, update a stale balance, book accommodation for an Entered event inside ten days, chase an overdue receivable, trim a category over estimate) scored by runway weeks added per hour of effort.

Milestone: the next coverage threshold in 5 percent steps (Arya: 15 percent); required weekly patron income = target × gross spend (0.15 × 1,281 = A$192/wk); progress = coverage ÷ target (73 percent); ETA extrapolates the six-month MRR history.

## 8. Acceptance criteria

F-AC-1. Given reserves A$9,450, gross weekly spend A$1,281 and MRR A$612, when the 07:00 UTC run completes, then `#kRunway` reads "8.3 wks" in amber, `#kReservesSub` reads "A$1,140/wk net burn", the MRR tile reads "covers 11% of weekly spend", and the dashboard tile shows 8.3 with "Under 10 weeks".

F-AC-2. Given No entry is selected, when the chart renders, then `#kZero` reads "Week 45", `#kFour` reads "9.1 wks · Genoa cheque 3 Oct", `#kAlarm` reads "Red in 4.3 wks", and a dotted green line rises above the cash-only projection from week 40.

F-AC-3. Given Poznań is the top pick, when Arya selects "Poznań · lose R1", then `#scenNote` reads "Cost −A$1,360 in wk 40 · R1 cheque +A$1,620" and runway reads 8.5 with "+0.2 vs no entry"; when she selects "Poznań · reach QF", then runway reads 10.5 in green with "+2.2 vs no entry".

F-AC-4. Given Arya types 10450 and taps Update, when the save completes, then `#balV` and `#kReserves` read "A$10,450", `#balStamp` reads "Updated just now", the toast reads "Balance updated +A$1,000 · runway now 9.2 wks", and the audit holds A$9,450 as the previous value.

F-AC-5. Given Arya taps Try with sample receipts, when the first is read, then `#axTitle` reads "Check what was read · nothing counts until you save", `#axQueue` reads "Receipt 1 of 3", Amount is 64, What is "Trattoria da Gino · Genova", Category Food, Tournament "CH 75 Genoa (Q)", `#axFx` reads "€38,50 → A$64 · ECB rate 1.651 on 10 Sep · card digits redacted", and no Check badge shows.

F-AC-6. Given the Farmacia Centrale receipt (€14,20, category uncertain) is read, when the review opens, then Category carries a "Check" badge with an amber border, the toast reads "Read €14,20 from Farmacia Centrale · 1 field to check", Skip this one is visible, and Save succeeds with the category unchanged.

F-AC-7. Given Arya saves the €38,50 receipt, when the ledger re-renders, then a fresh row for −A$64 appears first with a receipt button whose expansion shows "€38,50 · converted at ECB rate on 10 Sep", reserves fall to A$9,386, the toast reads "Logged −A$64 · runway now 8.2 wks", and the next receipt opens.

F-AC-8. Given Genoa Q2 is Pending, when Arya marks it received on 3 Oct, then a balance entry with cause receivedPrize is written at the 3 Oct rate, `#kReserves` rises by the realised amount, the dotted line and the Pending step disappear, and the Prize income row reads Paid in green.

F-AC-9. Given A$1,445 of expenses are dated 7 to 13 September against a A$1,200 budget, when Budget vs actual renders, then `#wkBar` is red at 100 percent, `#wkSub` reads "A$245 over budget · the agent will trim next week's shortlist", the Genoa row reads "est A$1,900 · A$2,425 · +28%" in amber, and Poznań reads "not started".

F-AC-10. Given the run chose "Publish the patron update before Poznań" and Arya taps Not this week, when the toast "Snoozed until Monday 07:00" shows, then the card shows the runner-up candidate and the snoozed one is absent from every run until Monday 07:00.

F-AC-11. Given Gerhard opens the manager link, when it renders, then runway, reserves, the P&L, the ledger with thumbnails and patron income are visible and no "one thing" card, note or draft appears; given Marko opens the coach link, then no money value appears anywhere.

F-AC-12. Given a Free player opens `#/agent/financial`, when it renders, then the full layout appears dimmed with sample data, one lock badge and one "Start Pro trial" action, and Update, Enter manually and Scan receipt are disabled.

## 9. Notifications produced

FYI, daily at 07:00 UTC: "Runway 8.3 weeks · amber" with body "Unchanged since yesterday. One action: publish the patron update before Poznań.", folded into the weekly digest when the colour is unchanged (M-NOTIF-3). For you: "Runway now under 10 weeks" or "Runway now under 4 weeks" on the morning the colour changes, stating reserves, burn and the action; "Genoa cheque is 7 days late" (F-24). FYI: "Update your balance" on Sundays; "This morning's run didn't complete"; "Poznań planned expense logged · A$1,360" when PRD-01 writes a planned line. Never more than one For-you item per run (M-NOTIF-1).

## 10. Sharing scope

Manager: runway, reserves and balance history, P&L, the ledger with renditions, receivables, patron income and the payout log; not the "one thing" card, notes or drafts (M-SHARE-2). Coach: nothing (M-SHARE-1). Patrons and public profile: nothing; a draft may say a week "cost a first-round cheque" only with approval and never a figure from this agent (PRD-05). Export (M-PRIV-2): ledger, receivables, balance entries, estimates and run records as JSON and CSV.

## 11. Analytics events

fin_run_completed (trigger, runway, colour, cost), runway_colour_changed (from, to), scenario_selected (key), balance_updated (delta, daysSinceLast), reminder_toggled, expense_saved (source, cat, hasTournament, currency, flaggedCount, editedFields), receipt_queued (count, fromCamera), receipt_extracted (latencyMs, flaggedCount), receipt_skipped, receipt_failed, batch_completed (saved, skipped), ledger_tab_changed, export_requested, action_opened (candidate), action_snoozed (candidate), milestone_reached, receivable_marked_received (daysFromExpected), budget_over (amount), locked_view. Product KPIs: the four success measures in section 1 plus extraction fields saved unedited (target 85 percent).

## 12. Out of scope and open questions

Out of scope for Release 1: bank and card aggregation (rejected by decision), tax modelling beyond withholding, invoices, multi-currency reserves, split receipts, and any editing by the manager.

Open questions: whether gross weekly spend should be a four-week average, eight weeks or the season median (four weeks is a placeholder); the 0.8 confidence threshold for the Check badge is a placeholder pending real receipts; whether milestone steps should be 5 percent or the player's own target; whether the ECB rate suits CNY (PRD-00 section 10); whether the second "one thing" sentence should go, keeping the card to a single action.

Resolved 13 September 2026 (prototype v0.3): the MRR tooltip and payout formula now use 8 percent on gross with Stripe's charge (1.75 percent + 30c per charge) deducted separately (worksheet 5 and 6); the September P&L excludes the pending Genoa cheque (worksheet 7); `PZ` stores Genoa's prize in euro at the locked rate. Remaining notes: The Budget vs actual markup reads "A$1,035 of A$1,200" but `renderBudget` recomputes A$1,445 and the over-budget state at boot; the latter is specified here. "Adds 0.4 weeks of runway" for two more patrons computes to about 0.1 weeks.
