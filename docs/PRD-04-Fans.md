# PRD-04 · Fans (patron programme)

Version 0.2 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/fans` (KPI row, Last 30 days, Tiers, People, Payouts, Monthly recurring revenue), the Patrons pulse tile and Patrons card on `#/`, the "Back the season" tiers and "Become a patron" call to action in the public profile preview on `#/profile`, the Plan & billing, Connections (Stripe Connect Express, Resend) and Sharing panes on `#/settings`, the Fans and Stripe items in the notification rail, and the Patrons tile and step 4 on `#/first-week`. Patron updates themselves are specified in PRD-05; the public page is specified in PRD-11 and only its patron sign-up behaviour is fixed here.

---

## 1. Purpose and job to be done

Twelve people pay Arya between A$29 and A$185 a month to follow a season that mostly happens in qualifying rounds nobody streams. They are her uncle, her father, a former junior coach, and nine people who found a Challenger draw page or her profile and decided to back her before the results did. Their A$612 a month covers 11 percent of her weekly spend today and is the only income line she controls. The Fans surface exists so that she treats them as people first: who joined, who has gone quiet, who left after fourteen months without saying why, and what to write to them. The money comes second, and the page says so: "Twelve people who backed you before the results did. This page is about them first, and the money second."

Job statement: "Show me who is with me, who is drifting, and who just arrived, draft the note I should send each of them in my own voice, and make sure the money they give me lands every Friday without my touching a card number, so that I keep the people I have and the programme grows from what I publish."

Success: twelve-month retention stays above 85 percent; every patron who leaves or goes quiet receives a player-approved note within seven days; the Pro cap and waitlist never show an error to a would-be patron; payouts reconcile with the Financial Agent's patron income line to the cent.

## 2. Users and entitlements

Player on Pro: tiers, up to 50 active patrons, an 8 percent platform fee, drafted messages, payouts. Player on Elite: the same with no cap and a 5 percent fee. Player on Free: the public profile only (PRD-00 section 4); `#/fans` renders the locked state with sample patrons and one "Start Pro trial" action (M-TIER-1), and the public page shows no tiers. Manager via share link: patron counts, tiers, retention, the payout log and MRR, never the drafted notes (M-SHARE-2). Coach via share link: nothing from this surface (M-SHARE-1). Patron: the public page, Stripe Checkout, the updates their tier receives, and a Stripe-hosted portal to change tier, card or cancel. Under-18 players: the guardian's manager link sees payouts; the public page is off by default (M-ID-3).

Downgrade from Pro to Free (M-TIER-2): patron records stay readable, patron billing pauses at period end with a notice to each patron, payouts stop after the final one, and "Downgrade to Free" in Settings says "nothing is deleted".

## 3. Agent contract

Trigger. Fans is event-driven rather than scheduled. Stripe webhooks (subscription created, tier changed, cancelled, payment failed, payout paid) update the patron record within a minute. Resend open events update the six-update strip. A daily attention pass at 06:00 local flags quiet and churn-risk patrons and asks the Content Agent (PRD-05) for one drafted note per flagged patron. The weekly payout is Stripe's own Friday schedule, not an agent action.

Inputs. The Stripe Connect account state (KYC, bank last four), subscriptions by tier and status, invoices and failed payments, payout records; Resend delivery and open events per patron per update; the patron's join source (public profile, draw page link, direct link, unknown); the player's voice profile and past updates for drafted notes (PRD-05); the tier definitions; the player's tier for the cap and fee.

Outputs. The patron list with tier, tenure, city, open strip and attention flag; the events feed with attribution sentences; the KPI figures; the payout table; MRR history; one drafted note per flagged patron; per event one FYI notification (join, upgrade, departure, payout sent) or one For-you notification (card failed, waitlist forming, KYC action required).

Approval gate. No note is sent without the player's tap on "Send to <first name>"; the drafted text is editable and the line under it says so: "Opening line drafted by the Content Agent in your voice. Sent from you, by email, not through the agent." Tier price changes take effect only after a confirm step that states how many patrons are affected and when. Payouts are executed by Stripe on schedule and are not reversible; the table says "Scheduled" until Stripe confirms "Paid" (M-GATE-3). The agent never messages a patron, changes a tier or refunds on its own (M-GATE-1).

Failure behaviour. If a Stripe webhook is delayed, the list shows the last-known state with "Stripe · not refreshed since <time>" and the KPI row is unchanged. If Resend opens are unavailable, the strip shows grey squares with the tooltip "Open data not yet received". If a drafted note fails to generate, the Send a note control opens an empty textarea with "Write it yourself; the agent couldn't draft this one." If KYC lapses, the Payouts card shows "Action required in Stripe" with a link and payouts show Held.

Audit. Every sent note (recipient, text as sent, timestamp, device), every tier change (before, after, patrons affected), every waitlist entry and invitation, and every webhook applied are logged; Stripe holds the money trail and the app stores payout ids (M-GATE-4).

Cost. Drafted notes are the only model spend: target under A$0.03 per note, generated on flag or on tap, never in bulk.

## 4. Surfaces and states

### 4.1 Fans page (`#/fans`)

Header: the description quoted in section 1; Copy patron page link (toast "Copied procircuit.ai/p/arya-dubey"); Post an update (to `#/agent/content`).

KPI row: Patrons "12 · +2 this month" with "Courtside 8 · Locker Room 3 · Inside Track 1"; Kept over 12 months "92%" in green with "1 left in the last 90 days" and the tooltip "Share of patrons from a year ago who are still with you. The relationship number that matters more than MRR."; Average time with you "7.4 months" with "Longest: Gerhard B. · 20 months"; Next payout · Fri 19 Sep "A$549" with "A$612 gross · 8% fee · Stripe Connect".

Last 30 days card: "Joins and departures as people, not numbers. Dashed lines are the updates you published."; the chart `#fanChart` from `drawFans` with join bars above the axis (Daniel R., Mira K., "Chris O. ↑"), a departure bar below (Anna P.), dashed publication lines for the three updates, the axis labels "13 Aug" and "Today" and the totals "3 joined" and "1 left"; the events list with an attribution sentence per event ("Mira K. joined Courtside · 48 hours after "Clay block, week two" · found you via the Poznań draw page", "Daniel R. joined Courtside · Same day as the update · came from your public profile", "Anna P. left Locker Room · 14 months. Opened every update until July. No reason given.", "Chris O. moved up to Locker Room · After the Poznań quarter-final").

Tiers card: three rows from `TIERS` with colour dot, name, "A$29/mo · 8 people", the perks sentence and a share bar; Edit tiers (toast "Tier editor · prices, perks and gating"); the loop card "Publishing keeps people · the loop the Content Agent feeds" listing "Clay block, week two · Thu 4 Sep · Courtside + Locker Room · opened 71% · +2 joins in 7 days", "What Poznań taught me · Mon 25 Aug · all tiers · opened 83% · +1 join · 1 upgrade", "Two weeks, three cities · Sun 10 Aug · opened 64% · +1 join in 7 days".

People card: "Who they are, how long they've been here, and whether they're still reading. Squares are your last six updates."; filters All, Courtside, Locker Room, Inside Track, Needs attention; search `#patQ` "Search by name or city"; the list `#patList` from `renderPatrons`, one row per `PATRONS` entry: initials avatar in the tier colour, name, tier badge, a state badge (New in lime, "Gone quiet" in amber, "Payment failed" in red, "Left 25 Aug" in grey), the meta line (flag and city, "since Jan 2025", "20 months", the note such as "Dad. Came to Poznań." or "Card payment failed on 10 Sep · Stripe retries Fri"), the six-square open strip with "5 of 6 opened", and one action (Send a note, Nudge gently for a failed card, Send a thank-you for a departed patron). Tapping the action opens an inline textarea pre-filled with the drafted note, the provenance line quoted in section 3, Cancel and "Send to <first name>"; sending toasts "Sent to Anna P." Empty state: "No one matches · Try another name or clear the filter."

Payouts card: "Weekly, every Friday, through Stripe Connect."; the connection row "Stripe Connect Express · verified · Bank ending 4821 is held by Stripe, not ProCircuit. Change it in the Stripe dashboard." with an Active badge; the table Friday, Gross, Fee 8%, Stripe, Paid to you, Status (19 Sep A$612, −A$49, −A$14, A$549, Scheduled; 12 Sep Paid; 5 Sep A$554, −A$44, −A$13, A$497, Paid; 29 Aug Paid); footer "The platform fee is 8% of what patrons pay (5% on Elite), taken on the gross. Stripe's 1.75% + 30c per charge is shown separately. Payouts appear in the Financial Agent as patron income."

Monthly recurring revenue card: "Shown last on purpose. Six months, gross, before fees."; badge "A$612 · +19% mo/mo"; the chart `#mrrChart` from `drawMRR` with six bars Apr to Sep labelled A$380, A$410, A$455, A$490, A$514, A$612.

States: fresh; filtered; searched; empty search; note open; note sent; attention filter with no one flagged ("Everyone's reading. Nothing to do here."); Stripe not refreshed; KYC action required; payout Held or Failed; cap reached on Pro ("50 of 50 · 3 on the waitlist" replaces "+2 this month"); Free locked; no patrons yet (section 4.4).

### 4.2 Dashboard (`#/`)

Patrons since last login tile: tooltip "People, not money: who joined or left your patron page since you last opened the app. Revenue lives in Fans and the Financial Agent.", badge Healthy, "+2 new, 0 churned", "Both joined Courtside after Thursday's update", a twelve-week spark. Patrons card: "12 people · Courtside 8 · Locker Room 3 · Inside Track 1", the last three events, the loop line "Last update → +2 joins · Publishing keeps patrons. MRR A$612, secondary." and Open Fans.

### 4.3 Public page and Settings (`#/profile`, `#/settings`)

The preview shows "Back the season" with the three tiers, Locker Room highlighted, the "Become a patron" call to action, and the opt-in thank-you line "Thanks to Mira, Daniel, Chris, Jonas and 8 more." governed by the switch "Patron names · Courtside patrons can be thanked by first name on the page. Each one opts in." Settings: Plan & billing "Pro · A$49 a month · renews 3 October · 12 of 50 patrons" and "Patron payouts · Stripe Connect · Separate from your plan · weekly, Fridays"; Connections "Stripe Connect Express · Patron payments and payouts · KYC complete" and "Resend · patron email · Sending as updates@aryadubey.com · domain verified"; Sharing manager pill "✓ Patrons".

### 4.4 First-week state (`#/first-week`)

Patrons tile "0 patrons · Build your public page and switch on the tiers. Most players get their first patron from people who already know them." and step 4 "Build your public page and switch on patron tiers · Headline, bio, photo, three tiers. Stripe Connect handles payouts; KYC takes about ten minutes."

## 5. Functional requirements

P-1 (Must). The programme has three tiers with editable names, monthly prices and perk sentences, defaulting to Courtside A$29, Locker Room A$65 and Inside Track A$185, priced and charged in the player's home currency through Stripe (M-CUR-1).

P-2 (Must). Patrons sign up only on the public page through Stripe Checkout; the app never sees or stores card data, and the page shows tiers only when the player is on Pro or Elite and Stripe KYC is complete.

P-3 (Must). On Pro, the 51st active patron is offered a waitlist instead of checkout, with the copy "Arya's page is full for now. Leave your email and you'll be first in when a place opens." and no error state (M-TIER-3).

P-4 (Must). When a place opens on a capped Pro account, or the player upgrades to Elite, waitlisted people are invited by email in order, and the player sees the waitlist count on the Patrons KPI.

P-5 (Must). A patron record holds tier, since date, tenure in months, city and country as given at checkout, join source, status, and the open flag for each of the last six updates delivered to them.

P-6 (Must). Every Stripe subscription event (created, tier changed, cancelled, payment failed, payment recovered) updates the record within one minute and writes an event to the Last 30 days feed with an attribution sentence when a source or a recent update explains it.

P-7 (Must). A join is attributed to an update when it occurs within seven days of that update's send time, and the attribution appears in the event, on the update's row in the loop card and in PRD-05's history with the same count.

P-8 (Must). The People list filters by tier and by Needs attention, searches name and city, shows the empty state when nothing matches, and never shows more than one state badge per patron.

P-9 (Must). Needs attention includes patrons with no opens across the last three delivered updates ("Gone quiet"), a failed payment Stripe is retrying ("Payment failed"), and anyone who left in the last 90 days; the daily pass recomputes it at 06:00 local.

P-10 (Must). Each attention row offers one drafted note in the player's voice (a thank-you for a departure, a gentle nudge for a failed card, a check-in for a quiet patron, a welcome for a new one) that the player edits and sends by tapping "Send to <first name>"; nothing is sent otherwise, and the provenance line under the draft is shown verbatim.

P-11 (Must). A sent note goes from the player's verified sending address through Resend, is logged with its text, and is never sent in bulk; replies come to the player, not the agent.

P-12 (Must). Payouts run weekly on Fridays through Stripe Connect Express to the bank account Stripe holds; the app shows the last four digits only and links to the Stripe dashboard for changes.

P-13 (Must). Each payout row shows gross, the platform fee at the player's tier, Stripe's charges as a separate column, and net, with status Scheduled, Paid, Held or Failed, and Paid rows are irreversible and say so on hover (M-GATE-3).

P-14 (Must). Paid payouts appear in the Financial Agent as patron income lines on the payout date (PRD-03), and gross MRR by tier is available to its Patron MRR tab.

P-15 (Must). The KPI row shows active patrons with the month's net change, twelve-month retention, average tenure with the longest-serving patron, and the next payout with its gross, all defined in section 7.

P-16 (Must). The MRR chart shows six months of gross MRR before fees with the month-on-month change, and is drawn last on the page.

P-17 (Must). A patron can change tier, update their card or cancel through the Stripe portal linked from every update's footer; a tier change is recorded as an upgrade or downgrade event and cancellation records a reason when the patron gives one, otherwise "No reason given".

P-18 (Must). Downgrade to Free pauses patron billing at period end, emails each patron a notice the player has seen first, keeps every record read-only and exportable, and resumes billing without re-signup if the player returns within 90 days (M-TIER-2).

P-19 (Must). Courtside patrons may opt in at checkout to be thanked by first name on the public page; the player's switch controls whether the line shows at all.

P-20 (Should). Inside Track patrons receive updates a day early with the player's call notes when PRD-05's recipient setting says so, and the tier perks sentence states it.

P-21 (Should). The events feed shows the join source (public profile, draw page link, direct link) when the checkout referrer is known.

P-22 (Could). A patron-facing monthly summary email per tier (results, next event) generated by PRD-05 for approval.

P-23 (Won't, Release 1). One-off tips, annual patron billing, gifting a patronage, and patron-to-patron features; the Fan Agent conversation is PRD-10 (Elite).

## 6. Data dictionary

Patron (owned here; read by PRD-05 for recipients, PRD-03 for income, PRD-11 for names):

| Field | Type | Source | Notes |
|---|---|---|---|
| id | string | platform | Stripe customer id mapped |
| n | string | checkout | shown as "Mira K." |
| tier | enum Courtside, Locker Room, Inside Track | Stripe | current |
| since, mo | month, integer | Stripe | tenure in whole months |
| city, country | string | checkout | flag via `pflag` |
| source | enum profile, draw, direct, unknown | checkout referrer | P-21 |
| status | enum active, pastDue, paused, left | Stripe | left keeps the record |
| leftAt, leftReason | date, string or null | Stripe portal | "No reason given" when null |
| opens | array of 6 of 1, 0 or null | Resend | null when not delivered |
| flag | enum quiet, card, new, none | attention pass | one badge at most |
| note | string | attention pass, player | "Upgraded after Poznań" |
| namesOptIn | boolean | checkout | P-19 |

Tier (`TIERS`): name, price, colour, perks, activeCount. Payout: id, friday, gross, platformFee, stripeFee, net, status. Update stats (from PRD-05): id, sentAt, tiers, openRate, joins7d. Waitlist entry: email, joinedAt, invitedAt, converted. Note sent: patronId, text, sentAt, device, kind (thanks, nudge, checkin, welcome). Event: kind (join, upgrade, downgrade, leave, cardFailed, payout), patronId, at, attribution text.

## 7. Business rules and formulas

Gross MRR = Σ active patrons per tier × tier price (8 × 29 + 3 × 65 + 1 × 185 = A$612). Month-on-month change = MRR this month ÷ MRR last month − 1 (612 ÷ 514 − 1 = 19 percent). Weekly patron income for PRD-03 = MRR × 12 ÷ 52.

Fees per payout = platform fee × gross (8 percent on Pro, 5 percent on Elite, applied to the gross patron payment) + Stripe's charges (1.75 percent + 30c per charge). Net = gross − platform fee − Stripe's charges, shown as three columns (Gross, Fee 8%, Stripe) so the player sees both deductions. On A$612 from 12 patrons: fee A$49, Stripe A$14, net A$549. Decided 13 September 2026 (worksheet 5 and 6).

Cap: a Pro account accepts checkout while active patrons are fewer than 50; at 50, the page offers the waitlist. Elite has no cap. Active means status active or pastDue.

Twelve-month retention = patrons active twelve months ago who are still active ÷ patrons active twelve months ago, shown as a whole percentage (the prototype shows 92 percent). Average tenure = mean whole-month tenure of active patrons. Longest = maximum tenure.

Attention flags: quiet when the last three delivered updates were all unopened and the patron is older than 30 days; card when Stripe reports a failed payment in retry; new for the first 7 days; departed patrons stay in the Attention filter for 90 days. A patron carries at most one flag, in the order card, quiet, new. The thresholds of three updates, 30 days and 90 days are placeholders (section 12).

Attribution: a join, upgrade or departure within seven days after an update's send time is attributed to that update and counted once in the update's "joins in 7d"; the attribution sentence names the update and the source when known.

Drafted note kinds: thanks for a departed patron ("Anna, I noticed you moved on last month. Fourteen months is a long time to back someone on the ITF grind…"), nudge for a failed card ("Stripe says your card didn't go through this week. No rush at all, it'll retry on Friday."), check-in for a quiet patron, welcome for a new one; each is generated by PRD-05 under its voice rules and never mentions runway, other patrons' names or payment amounts.

## 8. Acceptance criteria

P-AC-1. Given Arya has 8 Courtside, 3 Locker Room and 1 Inside Track patrons, when `#/fans` renders, then the Patrons KPI reads "12 · +2 this month" with "Courtside 8 · Locker Room 3 · Inside Track 1", the MRR badge reads "A$612 · +19% mo/mo", and the MRR chart's last bar is labelled A$612 after A$514.

P-AC-2. Given the next payout is Friday 19 Sep on A$612 gross, when the Payouts card renders, then the row reads Scheduled with gross A$612, fee −A$49, Stripe −A$14 and net A$549, the footer states the fee is taken on the gross and Stripe's charge is separate, and the KPI reads "Next payout · Fri 19 Sep" with "A$612 gross · 8% fee · Stripe Connect".

P-AC-3. Given Stripe confirms the 19 Sep payout, when the webhook is applied, then the row status becomes Paid, hovering it says the payout cannot be reversed, one FYI notification "Payout sent · A$551" exists, and a patron income line for the same net amount dated 19 Sep appears in `#/agent/financial`.

P-AC-4. Given Sophie T. has not opened the last three updates, when the 06:00 attention pass runs, then her row shows the amber "Gone quiet" badge, "3 of 6 opened", the note "Hasn't opened the last three updates", and she appears under Needs attention alongside Tom B. (Payment failed) and Anna P. (Left 25 Aug) and no one else.

P-AC-5. Given Arya taps Send a thank-you on Anna P.'s row, when the note opens, then the textarea contains a draft beginning "Anna, I noticed you moved on last month", the line "Opening line drafted by the Content Agent in your voice. Sent from you, by email, not through the agent." is shown, and nothing is sent until "Send to Anna" is tapped, after which the toast reads "Sent to Anna P." and the note is logged.

P-AC-6. Given Mira K. completed checkout at 05:41 on Fri 5 Sep from the Poznań draw page link, 48 hours after "Clay block, week two" was sent, when the webhook is applied, then her record is Courtside with source draw, the event reads "Mira K. joined Courtside · 48 hours after "Clay block, week two" · found you via the Poznań draw page", the update's joins in 7d becomes +2, and one FYI notification "Mira K. joined Courtside" with body "Second join within 48 hours of "Clay block, week two". 12 patrons now." exists.

P-AC-7. Given Anna P. cancels through the Stripe portal without giving a reason after 14 months, when the webhook is applied, then her status is left with leftReason null, the event reads "Anna P. left Locker Room · 14 months. Opened every update until July. No reason given.", the Kept over 12 months sub-line reads "1 left in the last 90 days", and her row remains in the list with the "Left 25 Aug" badge and a Send a thank-you action.

P-AC-8. Given Tom B.'s card payment failed on 10 Sep, when the webhook is applied, then his badge reads "Payment failed", the action reads Nudge gently, the drafted note mentions that Stripe retries on Friday, and one For-you notification "Tom B.'s card payment failed" with body "Stripe retries Friday. A gentle nudge is drafted if you want it." exists.

P-AC-9. Given a Pro player has 50 active patrons, when a visitor taps Become a patron on the public page, then no Stripe Checkout opens, the waitlist copy in P-3 appears with an email field, and the Patrons KPI on `#/fans` reads "50 of 50 · 1 on the waitlist" after submission.

P-AC-10. Given that player upgrades to Elite, when the plan change takes effect, then the cap is removed, the waitlisted person receives an invitation within five minutes, and the payout footer reads "5% on Elite" for the following Friday.

P-AC-11. Given Arya types "Vienna" in `#patQ`, when the list filters, then exactly the Vienna patrons (Daniel R., Petra H., Sophie T., Markus F., Gerhard B.) remain, each with the AUT flag; given she types "Zzz", then the empty state "No one matches" appears.

P-AC-12. Given a Pro player with 40 patrons downgrades to Free, when the change takes effect at period end, then all 40 records remain readable and exportable, each patron has received the pause notice the player saw first, no charge is raised, the payout table shows no new Scheduled row, and the public page shows no tiers.

P-AC-13. Given Gerhard opens the manager link, when patron data renders, then patron counts, tiers, retention, the payout table and MRR are visible and no drafted note or open strip appears; given Marko opens the coach link, then nothing from `#/fans` appears.

P-AC-14. Given the "Patron names" switch is on and Mira, Daniel, Chris and Jonas opted in, when the public page renders, then the line "Thanks to Mira, Daniel, Chris, Jonas and 8 more." appears under the tiers; given the switch is off, then no patron name appears anywhere on the page.

## 9. Notifications produced

FYI: "<Name> joined <tier>" with attribution body and action See; "<Name> moved up to <tier>"; "<Name> left <tier>" with tenure and "A thank-you note is still worth sending." and action Write; "Payout sent · A$549" with body "A$612 gross, minus the 8% platform fee (A$49) and Stripe (A$14). Lands Monday." and action Payouts. For you: "<Name>'s card payment failed" with the drafted nudge offered; "Your page is full · 3 on the waitlist" when the Pro cap is reached; "Stripe needs something from you" when KYC or bank details lapse. The Patrons pulse tile aggregates joins and departures since last login and never duplicates the rail. Patron-facing emails (welcome, pause notice, waitlist invitation) are system emails from the player's sending address and are shown to the player in Settings before first use.

## 10. Sharing scope

Manager: patron counts by tier, retention, tenure, the events feed without drafted notes, the payout table and MRR (M-SHARE-2). Coach: nothing (M-SHARE-1). Public page: tiers, prices and perks, the "Become a patron" or waitlist control, and opted-in first names only (P-19). Patrons: their own tier, updates and Stripe portal; never other patrons' names or the player's finances. Export (M-PRIV-2): patron list, events, notes sent, payouts and waitlist as JSON and CSV.

## 11. Analytics events

patron_joined (tier, source, attributedUpdate), patron_upgraded, patron_downgraded, patron_left (tenureMonths, hasReason), payment_failed, payment_recovered, waitlist_joined, waitlist_invited, waitlist_converted, attention_flagged (kind), note_opened (kind), note_edited, note_sent (kind, editedChars), note_cancelled, patron_filter_changed, patron_search, tier_edit_opened, tier_changed (field), payout_scheduled, payout_paid (gross, net), payout_failed, kyc_action_required, page_link_copied, locked_view. Product KPIs: twelve-month retention (above 85 percent), notes sent within 7 days of a flag (above 80 percent), joins attributed to updates (share of joins), waitlist conversion on upgrade, payout reconciliation errors (zero).

## 12. Out of scope and open questions

Out of scope for Release 1: one-off tips, annual patron billing, gifting, patron comments or community features, the Fan Agent Q&A (PRD-10, Elite), sponsor tiers (PRD-09), and merchandise or event ticketing for the Inside Track seat.

Open questions: whether Stripe's charge should be shown to patrons at checkout or absorbed (the fee basis itself, gross, was decided 13 September 2026); whether a waitlisted person is invited automatically when a patron leaves or only when the player confirms; how a tier price change applies to existing patrons (grandfather or migrate); the attention thresholds of three unopened updates, 30 days and 90 days are placeholders, as is whether open tracking is reliable enough under mail privacy features to drive the quiet flag at all; how the Inside Track "seat at one event a season" is fulfilled and recorded.

Resolved 13 September 2026 (prototype v0.3): the payout table, formula, KPI, notification and MRR tooltip all use 8 percent on gross with Stripe shown separately; the retention KPI is labelled illustrative; the joined count reads 2. Earlier notes kept for the record: The Average time with you KPI shows 7.4 months while the mean tenure of the twelve `PATRONS` records is about 10 months, and 92 percent retention cannot be derived from thirteen records; both are illustrative. `drawFans` counts Chris O.'s upgrade as one of "3 joined" while the KPI says "+2 this month". The public profile preview has no waitlist state for M-TIER-3, and there is no tier editor beyond a toast.
