DECISIONS WORKSHEET

DeuceX, prepared for Manu Dubey. Version 0.2, 13 September 2026. All seventeen decisions recorded on 13 September 2026 by Manu Dubey; two (Fan Agent label, mood window) differ from the drafted recommendation only in wording. Companion to PRD-00 through PRD-12 and the PRD Review Register.

HOW TO USE THIS

Seventeen conversations, one per page, each written so you can decide without opening three other documents at once. Every section gives: the question as a non-specialist could answer it, what the prototype does today against what PRD-00 assumes, the realistic options and what each means for the player, the patron or coach where relevant, and the build, a rough effort band, what changes downstream by requirement ID and document, whether the choice is reversible after launch, any legal, privacy or child-safety angle, a recommendation with reasoning, and a blank decision record. Where the documents leave something genuinely unsettled, this says so rather than inventing a position.

The seventeen are not independent. Identity and child safety (the guardian flow, ranking verification, sign-in method) sit under everything else: a player cannot be shown a correct runway figure or a public profile until who she is, and whether she is a minor, is settled. Money (the fee basis, the pending-prize rule) touches Stripe configuration and figures both player and patron see, so it is expensive to unwind once real money has moved. The approval-gate and tier-entitlement decisions (one-tap publishing, the Fan Agent label, Free-tier gating) all express the same promise, that nothing leaves the app without a tap and a locked surface always looks the same, and are worth deciding together.

The privacy and pricing decisions are the ones to get right first time; reversing them once real players, patrons or money are involved costs more than the code change shows. The gate, label and tier-state decisions are comparatively cheap to change later, being interaction patterns rather than data commitments. The placeholder constants in part two are, with one exception, safe to launch with a defensible default and tune from real usage. Fifteen of the seventeen decisions gate Release 1; two are recommended for deferral to Release 2 on their own merits and are marked as such below.

PART ONE: THE SEVENTEEN DECISIONS

Ordered as the register's section F suggests: child safety and identity first, then privacy, then money, then the gate and trust items, then the rest, grouped by theme.

1. Guardian flow for players under 18 (A11)

Should DeuceX require a guardian's email before an under-18 sign-up can finish, and switch on privacy defaults automatically? Onboarding step 1 today has a plain date-of-birth field feeding nothing downstream. M-ID-3 requires a guardian email, the guardian defaulted as the manager-link recipient, and the public profile off by default; none of it is built (PRD-11, section 12).

Options: build the branch now (a conditional field, an email trigger, two defaults), or decline sign-ups under 18 until it exists. A launch with no check at all is not a real option. Cost is roughly three to five days, touching PRD-11 OB-6, OB-23 and PRD-12's sharing surface.

This is not reversible once a real minor has onboarded unprotected: whatever exposure occurred cannot be undone by a later fix. It is a child-safety, Privacy Act and APPs matter, and a GDPR one for any European minor; flag for the company's own legal review rather than assuming an email address is sufficient everywhere.

Recommendation: build it before any real player onboards and treat it as a hard blocker. This ranking band includes genuine juniors turning professional; the cost of an unsupervised public profile for a minor is not proportionate to a few days of work.

Decision record: Build the guardian flow before launch and treat it as a hard blocker. Date of birth at onboarding step 1 gates a guardian email field for anyone under 18; the guardian receives the manager link by default; the public profile is off until the guardian confirms; an unconfirmed guardian at 14 days limits the account to Match Scribe with no sharing and opens a case in the admin console (PRD-13 AD-12). Flag for the company's own legal review per jurisdiction. Decided by: Manu Dubey Date: 13 September 2026

2. Unverified and ambiguous ranking match (A12)

When the system cannot cleanly match a name to a ranking record, should the player choose from candidates, continue unverified with a badge, or should the current always-resolves-to-one-match shortcut stay? M-ID-2 requires both the choice screen and the unverified path; neither exists in the prototype.

The ambiguous-choice screen is small, one to two days. The unverified path is bigger, three to five days, since it touches the publish gate, the profile badge and the dashboard hero. A cheaper but worse option is verified-only, turning away anyone the lookup cannot cleanly resolve, which excludes exactly the Stage 1 players (no ATP points yet, common surnames, a lagging ITF feed) this product targets.

Touches PRD-11 OB-3, OB-4, OB-23 and M-ID-2. Reversible in that the simpler path could ship first, but every day without both branches turns away real signups, a cost in lost trials, not just engineering debt. No major legal dimension beyond the light privacy benefit of an unverified profile staying unpublished.

Recommendation: build both before launch. The choice screen is cheap and the unverified path is core to the Stage 1 audience PRD-00 explicitly targets.

Decision record: Build both paths before launch. Ambiguous matches show a choose-from-candidates screen; no match proceeds unverified with a badge, no public profile and no coach or manager links until verified; support can re-run verification from the admin console (PRD-13 AD-9). Decided by: Manu Dubey Date: 13 September 2026

3. Audio retention: 7 days or 90 days (A3)

How long should recorded voice notes sit in storage: seven days after upload, or ninety? M-PRIV-1 requires deletion on transcript confirmation or after seven days, whichever first; the transcript stays. The Match Scribe badge, help tip, Connections pane and Data & safety pane all say ninety days with a manual delete-all action.

| | 7 days (spec) | 90 days (prototype) |
|---|---|---|
| Player | Little window to re-check a transcript | Weeks to resolve a dispute over what was said |
| Build | Fix three copy locations, a few hours | New lifecycle rule, ongoing storage cost, roughly a day |
| Privacy | Minimal window of raw voice at rest | A longer window of data that can include unguarded remarks |

Changing M-PRIV-1 to ninety days cascades into PRD-02 sections 7 and 8 and several acceptance criteria (S-13, S-18, S-AC-7, S-AC-8). The choice is operationally reversible going forward, but nothing already held under a looser window is retroactively deleted. This is a Privacy Act, APPs and GDPR data-minimisation question, sharper for European players given how unguarded a "talk like you would to a coach in the car" recording can be; flag for privacy review before choosing the longer window.

Recommendation: keep seven days and fix the copy. The product's own pitch is unguarded, spoken honesty; the tighter window is the more defensible position, and a ninety-day undo is not worth the larger window of sensitive audio at rest.

Decision record: Keep seven days. Audio is deleted on transcript confirmation or after seven days, whichever is first; the transcript stays. Fix the four copy locations (Match Scribe badge and help tip, Connections pane, Data & safety pane) in both player prototypes and keep the manual delete-all action. M-PRIV-1 stands; PRD-02 unchanged. Decided by: Manu Dubey Date: 13 September 2026

4. Delete-account cooling-off (A13)

Should there be a fourteen-day window after a deletion request before it happens, or does clicking the confirmation link delete straight away? M-PRIV-2 requires fourteen days; the current copy promises only "nothing happens until you click it," with no stated wait after the click.

Building the window means a pending-deletion state (patron billing paused, the already-specified public "moved on" placeholder, a recovery path, a scheduled job), roughly two to four days, touching PRD-12 ST-19 and section 7.

Skipping it is not reversible in the case that matters: a rash deletion, or one triggered by a compromised email account, becomes permanent the moment the link is clicked. This sits under the Privacy Act, APPs and GDPR's erasure right, which allows a reasonable process rather than instant deletion; the company's legal review should confirm the exact figure.

Recommendation: build the fourteen-day window. It is a well-understood pattern, a pending state plus a scheduled job, and it protects against exactly the failure modes a same-day delete cannot.

Decision record: Build the fourteen-day cooling-off. Clicking the confirmation link starts a pending-deletion state: patron billing paused with a notice to patrons, public page shows the 'moved on' placeholder, agents paused, recovery by the player (or by support at the player's request) at any point in the window, then a scheduled job deletes. Data & safety copy must state the fourteen days. Same window applies when support starts a deletion from the admin console (PRD-13 AD-11). Decided by: Manu Dubey Date: 13 September 2026

5. Platform fee: 8 percent or 10 percent (A1)

Does DeuceX take 8 percent of a Pro player's patron income, as PRD-00, the Fans footer and the Stripe notification all say, or 10 percent, as the prototype's payout arithmetic actually deducts? The 8 percent path is a bug fix, a few hours, correcting one function to match everything already written, including the onboarding pitch ("minus the 8% platform fee"). The 10 percent path means rewriting PRD-00's tier table, the Fans footer, onboarding copy and the Stripe template, plus a legal read of a pricing change made this late.

On A$612 gross MRR the difference is roughly A$12 to A$18 a month to the player. Changing the fee after real patrons are live is a visible cut needing its own communication, which is why the Australian Consumer Law's no-drip-pricing principle, already invoked elsewhere in PRD-00, matters here: the figure must be the same wherever shown, before and after checkout.

Recommendation: 8 percent Pro, 5 percent Elite; fix the arithmetic. Every document but one stray computation already assumes 8 percent, and the entire subscriber pitch is built on it.

Decision record: 8 percent on Pro, 5 percent on Elite. Fix the payout arithmetic in both player prototypes (A$612 gross → A$49 fee, not A$61) and the Financial Agent MRR tooltip. No copy or legal rewrite needed. Decided by: Manu Dubey Date: 13 September 2026

6. Fee basis: gross or net of Stripe's charges (A2)

Is the platform fee calculated on what the patron pays in full, or on what is left after Stripe's own charge? Linked directly to decision 5: the percentage means little until its base is fixed. Gross is simpler to state and reconciles more naturally against Stripe's own reporting. Net of Stripe gives the player a slightly higher payout at the cost of a more complex checkout disclosure.

Engineering cost is negligible either way, a formula choice inside PRD-04 section 7 and PRD-03's income reconciliation; the real cost is getting the patron-facing disclosure right. Reversible at the formula level, but changing it once patrons are subscribed changes what they understood about where their money goes. The Australian Consumer Law dimension is the same as decision 5's: the basis must be disclosed plainly at checkout.

Recommendation: gross. It is the more auditable rule and the smaller difference in payout is not worth the extra disclosure complexity.

Decision record: Gross. The fee is taken on what the patron pays before Stripe's charge; Stripe's charge is then deducted separately and shown as its own line in the Fans payout table and the patron checkout disclosure. Update PRD-04 section 7, PRD-03 income reconciliation, the admin console Money page (drop the 'assumed' wording) and PRD-00 section 10. Decided by: Manu Dubey Date: 13 September 2026

7. Pending prize money in the profit and loss (A4)

Should an unreceived prize cheque count as this month's income? M-DATA-2 says no, not until the player marks it received; the prototype's September P&L counts the pending Genoa cheque anyway. This is a bug, not a genuine choice: the correct logic already exists in PRD-03 (F-9); only the month-figure render ignores it. Fix is under a day.

Trivially reversible as a display rule, but the cost of shipping it wrong even once is not trivial: the Financial Agent's whole purpose is telling the player the truth about how long her money lasts.

Recommendation: fix the bug so month figures follow M-DATA-2. This is the one item here that is not really a decision.

Decision record: Fix the bug. Month figures follow M-DATA-2: a prize receivable stays in the paying currency and enters income and reserves only when the player marks it received; until then it appears only as the separate dashed 'with pending prize' projection. Fix the September P&L render in both player prototypes and store the Genoa prize in euro (B15). Decided by: Manu Dubey Date: 13 September 2026

8. Content Agent publishing gate: one tap or two (A7)

Should approving a patron update from the dashboard send in one tap, or always require a second confirming tap stating the consequence? The dashboard's "Approve & publish" currently sends in one tap with only a toast; the agent's own page uses a proper two-step confirm. M-GATE-2 requires the consequence sentence next to the approve control everywhere, not only on the full page.

Option one keeps the one-tap speed but prints the consequence sentence on the card itself ("Sends to 11 patrons now, cannot be recalled"). Option two forces the full two-step block onto the dashboard, matching the agent page but losing the speed that was the point of the shortcut. Both are UI-only, under a day each, with no data consequence and easy to change later.

Recommendation: keep the one-tap shortcut, but only once the consequence sentence sits on the card. A sent email cannot be unsent (M-GATE-3); the speed is only acceptable if the player has seen, in the same glance, exactly what the tap does.

Decision record: Keep the one-tap shortcut on the dashboard card, with the consequence sentence printed on the card next to the button ('Sends to 11 patrons now · cannot be recalled'). The agent page keeps its two-step. Update PRD-05 to allow the one-tap variant only where the sentence is visible in the same glance. Decided by: Manu Dubey Date: 13 September 2026

9. One draft per language (A8)

When a player has chosen more than one patron-update language, should each get a separately approved draft now, or should Release 1 ship one language per update? M-LANG-3 requires the former; Preferences ships English and Deutsch both on, but the editor shows one draft and one approval.

The full build (per-language tabs, each with its own checks, send, schedule or skip state) is larger than it looks, roughly five to eight days once history, recipients and notifications are all made language-aware. Touches PRD-05 C-4, section 4.1 and section 6. Reversible without risk to anything already sent, since each published update is immutable history.

Recommendation: ship single-language in Release 1, default Preferences to one language, and move M-LANG-3 to Release 2. A player's real weekly need is to write once, honestly, in the language she thinks in; rushing a multi-tab build risks shipping half-working consequence sentences per language, a worse M-GATE-2 problem than not having the feature.

Decision record: Single-language patron updates in Release 1. Preferences defaults to one patron-update language (the first chosen at onboarding) and the multi-select becomes single-select for Release 1; M-LANG-3 moves to Release 2 in PRD-00 section 8. The Mindset Coach still speaks in that one language. Decided by: Manu Dubey Date: 13 September 2026

10. Fan Agent answer label: fixed or toggleable (A9)

Should patrons always be told a reply came from the agent, with no setting to hide it? PRD-10's FA-2 requires a permanent label; the prototype builds the equivalent control in "How it speaks" as an ordinary switch. The fix is small, replacing a switch with a fixed statement, under a day, since Fan Agent itself is a Release 2, Elite feature shown only as a Pro-tier preview meanwhile.

This is a trust question more than a technical one: reversing it later, once patrons have relied on the label, costs more than never promising it. Presenting an AI answer as the player's own words to a paying subscriber sits close to misleading conduct under the Australian Consumer Law; flag for review even though the fix is trivial.

Recommendation: fix it as permanent now, ahead of the Release 2 build. It costs nothing, and every version of "let the player hide it" damages the product's core promise of honesty.

Decision record: Label is permanent on any reply the Fan Agent sends on its own. A player may switch on 'review before sending'; a reply the player has read and explicitly approved (or edited) goes out unlabelled as the player's own words, because it then is. There is no setting that hides the label on an unreviewed answer. Replace the prototype switch accordingly and update PRD-10 FA-2 and the admin case rule in PRD-13 (a reported unlabelled answer is a case only if it was unreviewed). Flag the wording for legal review before Release 2. Decided by: Manu Dubey Date: 13 September 2026

11. Sign-in method: magic link only, or password too (A5)

Should players sign in only by magic link and optional passkey, never a stored password, or should the working password field stay? M-ID-1 mandates the former; `#/signin` has a working password field with a browser password-autocomplete attribute and a reset flow beside the magic-link option.

Removing the password path is subtractive and cheap, under a day. Keeping it means rewriting M-ID-1 and building real credential security, hashing, forced reset, rate limiting, breach monitoring, a materially larger and never-finished piece of work, three to five days initially plus ongoing maintenance. Removing passwords now is easy; adding them back later, once players have set them, is a migration problem, so the cheaper path now is also the more durable one. Stored passwords are a meaningfully worse breach story for a product holding financial and patron data; flag for security review.

Recommendation: magic link and passkey only; remove the password field. No player-experience gap justifies the ongoing security surface.

Decision record: Magic link and passkey only. Remove the password field, reset link and autocomplete attribute from #/signin in both player prototypes. M-ID-1 stands. Staff sign-in to the admin console is magic link plus mandatory passkey (PRD-13 AD-1). Decided by: Manu Dubey Date: 13 September 2026

12. Share-link expiry visibility (A14)

Since a coach or manager link already lapses after ninety days, should the Sharing pane show exactly when? M-SHARE-3 requires it visible; today only last-opened time and count show. The fix is a date calculation and one line of UI, under a day, touching PRD-12 ST-16 and section 7. Trivially reversible, low stakes, but it prevents a real failure mode: a link the player has mentally forgotten about that is still silently working.

Recommendation: add the expiry date now. It is specified and cheap; there is no reason to leave the gap.

Decision record: Show the expiry date. Each share link shows 'expires <date>' beside last-opened in the Sharing pane, with a Renew action that resets the 90 days; the admin detail panel shows the same. Update PRD-12 ST-16. Decided by: Manu Dubey Date: 13 September 2026

13. Notification model: two categories or a per-event matrix (A6)

Should every notification run on two categories, For you and FYI, capped at one For-you item per agent run, or the finer per-event matrix already built in Settings (Shortlist ready, Entry deadline, Draft ready, Morning insight, Patron joined or left, Runway change, Payout sent, each with its own channels)?

| | Two categories (spec) | Per-event matrix (built) |
|---|---|---|
| Control | Coarse: mute all For-you or FYI per agent | Fine: mute one event, keep another |
| Build | Rewrite Settings into two columns per agent | Rewrite M-NOTIF-1, re-check the cap across six agent PRDs |
| Consistency | Matches quiet-hours and digest rules already written | Requires re-deriving those per event |

Reconciling toward two categories costs roughly two to three days and is additive-safe. Reconciling the other way is riskier: the one-For-you-per-run cap is an explicit acceptance criterion in PRD-01, 02, 03, 04, 05, 06, 08, 09 and 10. Moderately reversible, since preferences are not historical data, but re-teaching a changed layout has a support cost.

Recommendation: keep two categories, rewrite Settings as two columns per agent, and keep the event names as explanatory sub-text. Almost every other document assumes the cap; changing that foundation to match one screen is the wrong direction.

Decision record: Two categories, For you and FYI, with the one-For-you-per-run cap. Rewrite Settings > Notifications as two rows per agent (For you, FYI) against In app, Email and Push, keeping the event names as sub-text under each row. Quiet hours and digest rules unchanged. Admin console alert routing already follows the same two-category shape (PRD-13 AD-27). Decided by: Manu Dubey Date: 13 September 2026

14. Free tier and the Tournament Agent (A15)

Should Free see a Tournament Agent shortlist at all, given that with cost columns locked, the Conditions brief becomes the only live content in the detail panel? Three options: Free sees the shortlist and the full Conditions brief with everything else locked (close to what exists); Free sees only the list, no detail panel; or the Tournament Agent is Pro-and-above entirely. The first costs one to two days of copy and design to make the Conditions-only panel read as deliberate; the others discard existing UI for similar effort. No data or legal consequence, all reversible.

Recommendation: keep the shortlist and Conditions brief on Free, with one sentence in the locked area naming what Pro adds (cost, outcomes, runway effect). A real shortlist with dates and deadlines is a stronger trial hook than a locked, empty page.

Decision record: Free sees the shortlist and the full Conditions brief; cost, outcomes, runway effect and the entry controls are locked with one sentence naming what Pro adds and a single Start Pro trial action (M-TIER-1). Close PRD-00 section 10's question accordingly. Decided by: Manu Dubey Date: 13 September 2026

15. Fuel gating (A10)

Should Fuel stay reachable from every tier's quick-actions sheet, or be locked to Pro and Elite as PRD-00's tier table states? The straightforward fix routes a Free tap to the locked page instead of the camera, matching M-TIER-1's pattern, under a day. A softer option, a free teaser with a hard scan limit, needs a counter and a locked-after-limit state, closer to two days.

Recommendation: gate it plainly. Menu scanning is one of the more expensive model calls in the product; giving away even one free scan undermines the otherwise consistent rule that a locked surface is always dimmed with one upgrade action, never a working feature by accident.

Decision record: Gate Fuel plainly. On Free, the quick-actions sheet's Scan a menu item shows the lock and opens the locked Fuel page, never the camera. No free scans. Decided by: Manu Dubey Date: 13 September 2026

16. Studio tier states for Sponsor and Fan Agent (A17)

Should these show the three states PRD-00 promises (absent on Free, sample preview on Pro, live "Early access" badge and feedback link on Elite), or is the current single static preview enough for now? Building all three duplicates effort against Elite and the Studio agents, both explicitly Release 2 in PRD-00's own plan; leaving the single preview costs nothing extra today.

Recommendation: do not build the three-state version yet. Log it as a known gap to close before Elite ships, not a Release 1 blocker.

Decision record: Do not build the three-state Studio view for Release 1. Log as a gap to close before Elite ships (Release 2), including the Early access badge and feedback link required by M-TIER-4. Decided by: Manu Dubey Date: 13 September 2026

17. Mood chart window (A16)

Should the mood chart offer 30 and 84 days (12 weeks, as the brief called for), or keep 30 and 90 as built? PRD-06 notes plainly that one number should change. The smallest decision here, an hour or two either way. Worth noting: PRD-06's own pattern-detection rule already looks back 90 days, so a chart fixed at exactly 84 would show a slightly different window than the one the pattern logic scans.

Recommendation: keep 90 days. Matching the chart to the pattern window that already exists is more useful and consistent than an exact match to a brief written before that rule existed.

Decision record: Keep 30 and 90 days, matching the pattern-detection window in PRD-06 section 7. Update PRD-06 to say 90 rather than 84. Decided by: Manu Dubey Date: 13 September 2026

PART TWO: PLACEHOLDER CONSTANTS

These are the numbers the documents fixed in order to be testable, from register section D. None were chosen by measurement; each is a plausible guess. Grouped by the conversation each belongs to.

Tournament economics (PRD-01): the points value per ATP point (A$60), used to convert expected ranking points into dollars inside the cost-to-prize ratio, and the acceptance thresholds, 10 places inside last year's cut for direct acceptance, 40 outside for the alternate list. These decide which five events appear in a weekly shortlist and in what order, so this is not cosmetic tuning. The acceptance thresholds can be validated by calculation against real historical acceptance-list data, no player interviews needed. The points-value constant is a genuine judgement worth a short conversation with a few players across different stages, since it reorders the shortlist directly. Needs to be right before launch: a badly chosen constant mis-ranks the exact recommendation new players use to judge whether the product is worth trusting.

Model-confidence thresholds (PRD-02, PRD-03, PRD-06): mood-proposal confidence (0.6), receipt-extraction confidence (0.8), pattern Strong-confidence ratio (0.6), and memory-similarity threshold (0.82). All four decide whether the product presents something as confident or asks the player to check. Too low, wrong guesses erode trust; too high, constant prompting undermines the speed promise. These need real transcripts and receipts run through the actual models and checked against a human judgement, not a whiteboard guess. Tunable continuously after launch provided the defaults are conservative, biased toward asking rather than guessing, which is already the documented failure mode. Not launch-blocking in the sense of needing a perfect number, but the conservative direction should be confirmed now.

Financial smoothing window (PRD-03): the four-week trailing average behind gross weekly spend, net burn and runway. Whether four weeks, eight, or a season median smooths a spiky travel-and-tournament pattern best is a real-data question, visible only once real players have a season of ledger history. Four weeks is a defensible launch default, worth revisiting quickly once usage exists, since it feeds the single most-watched figure on the dashboard.

Patron attention thresholds (PRD-04): three unopened updates, 30 days, and 90 days, deciding when a patron is flagged quiet or drops off the attention list after leaving. Wrong values either bury disengaged patrons or nag the player about people who are fine, a cost measured in a mistimed nudge, not a wrong dollar figure. Safe to launch with current defaults and correct once real patron cohorts and a season of open-tracking data exist (this also links to the open-tracking reliability question in part three).

Conditions and equipment thresholds (PRD-08): the one-kilogram tension-test step, the frames-to-bring ladder of three, four and five, the 400-metre altitude threshold, the 10-point first-serve delta, and the 28-degree and 70-percent condition thresholds. Unlike the confidence thresholds, these are physical and sports-science judgements, not model-confidence dials, and PRD-08 itself says a stringer belongs in the conversation. This cluster deserves one specific conversation, a stringer and a couple of players in the room, before Release 1 proposes tension tests to real players, because a wrong recommendation here is equipment advice given right before a match, not a cosmetic label. Unlike the other placeholder groups, this one needs a first defensible answer before launch, not simply tuning afterwards.

Sponsor deal benchmark (PRD-09): the regional range of A$3,000 to A$12,000 plus product. Both the register and PRD-09 already flag the legal exposure: this is a market-sizing claim, and the Australian Consumer Law's prohibition on misleading claims about future matters applies directly. It needs grounding in real, anonymised placement data that will not exist until Sponsor Agent has been live for a season. Because Sponsor Agent is Release 2 and Elite-only, this does not gate Release 1, but the legal wording around the claim, not only the number, needs review before Elite ships, and is more urgent than the figure itself.

PART THREE: SCOPE QUESTIONS

These set roadmap rather than block build, and are treated more lightly here, as the register does.

A stringer share scope (PRD-08, PRD-00 section 10) asks how far the Conditions layer should reach before a stringer is brought into the product directly, rather than the player forwarding a test result herself. Whether the ECB reference rate suits CNY, or a market rate is needed, matters specifically for Chinese players and patrons and is worth a quick check against how far the two typically diverge. Whether the weekly travel budget should be a hard filter or a soft ranking penalty changes whether the Tournament Agent ever hides an event a player might have taken anyway. Whether Stage 3 players want ATP 250 qualifying in scope by default, or opt-in, is a smaller version of the same question nearer the top of the band. Whether the Free note quota should count discarded notes that reached transcription, since the cost is incurred either way, is a cost-control question more than a product one. Whether a waitlisted patron is invited automatically or only on the player's confirmation, and how a tier price change applies to existing patrons, grandfathered or migrated, both affect patron trust and are worth deciding before a real Pro account hits its cap. Whether the Mindset Coach's distress card needs jurisdiction-specific review per launch country, and whether under-18 players should see youth-specific crisis lines, is a genuine safety question deserving its own clinician review rather than a call made here. Whether open-tracking data is reliable enough under mail privacy protections to drive the patron quiet flag at all is worth testing empirically once real send data exists; the flag may need a fallback signal. How acceptance lists are sourced reliably for ITF events where the cut is published late is an operational question for whichever ranking-feed provider is chosen, not a product decision.

SUMMARY TABLE

| # | Decision | Recommendation | Gates launch | Effort |
|---|---|---|---|---|
| 1 | Guardian flow for under-18 players (A11) | Build the full guardian branch now | Yes | 3 to 5 days |
| 2 | Unverified and ambiguous ranking match (A12) | Build both branches now | Yes | 4 to 7 days combined |
| 3 | Audio retention, 7 or 90 days (A3) | Keep 7 days, fix the copy | Yes | Hours |
| 4 | Delete-account cooling-off (A13) | Build the 14-day window | Yes | 2 to 4 days |
| 5 | Platform fee, 8% or 10% (A1) | 8% Pro, 5% Elite; fix the arithmetic | Yes | Hours to a day |
| 6 | Fee basis, gross or net of Stripe (A2) | Gross | Yes | Under a day |
| 7 | Pending prize in the P&L (A4) | Fix the bug to match M-DATA-2 | Yes | Under a day |
| 8 | Content Agent gate, one tap or two (A7) | Keep one tap, add the consequence sentence | Yes | Under a day |
| 9 | One draft per language (A8) | Ship single-language in Release 1, defer to Release 2 | No | 5 to 8 days if built now |
| 10 | Fan Agent label, fixed or toggleable (A9) | Fix as permanent, non-optional | Yes | Under a day |
| 11 | Sign-in, magic link or password (A5) | Magic link and passkey only | Yes | Under a day to remove |
| 12 | Share-link expiry visibility (A14) | Add the expiry date now | Yes | Under a day |
| 13 | Notification model, two categories or per-event (A6) | Keep two categories, rebuild Settings | Yes | 2 to 3 days |
| 14 | Free tier and the Tournament Agent (A15) | Keep shortlist and Conditions brief visible | Yes | 1 to 2 days |
| 15 | Fuel gating (A10) | Lock it on Free like every other surface | Yes | Under a day |
| 16 | Studio tier states, Sponsor and Fan Agent (A17) | Leave as-is until Elite ships | No | None now |
| 17 | Mood chart window, 30/90 or 30/84 (A16) | Keep 90 days | Yes | Hours |
