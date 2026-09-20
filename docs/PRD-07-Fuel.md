# PRD-07 · Fuel

Version 0.1 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/fuel` (the context strip `.ctx`, the scan card `#fuelCard` with states `#fuScan`, `#fuProc` and `#fuResult` driven by `fuState`, the picks `#picks` built from `PICKS`, the history `#cities`, the "What Fuel won't do" card), "Scan a menu" in the quick-actions sheet `#qa`, the sidebar item, and the Food lines written into the ledger on `#/agent/financial`. The daily food budget is owned by PRD-03; the next-day mood by PRD-02 and PRD-06.

---

## 1. Purpose and job to be done

At 21:15 the night before a 10:00 qualifying match, a player is standing in a hotel restaurant in a country whose language she does not read, with a menu of fourteen dishes, A$34 of food money left for the day, and a rule about pork. What she orders is the last controllable variable of the day, and tonight it is decided by whichever dish has a photo. Fuel answers one narrow question, "what should I order", for exactly this moment. The player photographs the menu and Fuel returns two or three picks that fit where she is in the week, translated, priced in her home currency, with the words to say to the kitchen. The header says it plainly: "Photograph any menu and get two or three things to order, for where you are in the week. Translated, priced, with what to ask the kitchen."

Fuel is deliberately not a nutrition product. It does not count calories, set weight targets, propose supplements or make medical claims, and the page carries a card called "What Fuel won't do" whose subtitle is "On purpose." It reads the menu once and deletes the photo, keeping only the choice, the price and whether the next day felt right.

Job statement: "When I am about to order somewhere I don't know, read the menu for me, tell me the two or three things that fit tonight given tomorrow's match, my rules and what I have left to spend, tell me what to ask for, and remember what worked, so that food stops being a guess and never becomes a diet."

Success: median photo-to-picks time under 20 seconds; at least 60 percent of scans end with a logged pick; the share of meals followed by "Flat next day" falls over a season; zero picks violate a stated allergy or exclusion.

## 2. Users and entitlements

Player on Pro or Elite: full agent (PRD-00 section 4); the header carries the badge "Pro". Player on Free: `#/fuel` renders the locked state, the Sibiu sample dimmed with one explanation line and one "Start Pro trial" action (M-TIER-1); "Scan a menu" in `#qa` leads to that locked page, not to a camera. Coach via share link: nothing (M-SHARE-1). Manager via share link: the Food expense lines in the ledger (M-SHARE-2), never the picks or outcomes. Dietary constraints come from the profile and are hard rules, in the chip tooltip's words "From onboarding. Treated as hard rules, not suggestions."; the Preferences toast reads "Preferences · no pork, prefers fish and chicken · no allergies on file · edit in Settings". Downgrade (M-TIER-2): history readable, scanning disabled, expense lines kept.

## 3. Agent contract

Trigger. On demand only: Take photo, Choose photos or "Try the hotel menu in Sibiu" on `#/fuel`, or "Scan a menu · What to order tonight, for tomorrow's match" in the quick-actions sheet, which routes to `#/fuel` and focuses Take photo. There is no scheduled run. A second trigger, the outcome question, fires the next day inside the Match Scribe or Mindset check-in when a meal was logged (section 7) and runs no model.

Inputs. One or more menu photographs (`accept="image/*"`, rear camera, multiple files); time and city; the next match from the Tournament Agent ("Match tomorrow 10:00 · Q1 vs Petrov"); the last match and travel legs for the day; the dietary profile; the food budget left today from the Financial Agent ("A$34 left for food today", tooltip "Food line of this week's A$1,200 budget, from the Financial Agent."); the ECB rate; the meal history for this city.

Outputs. A structured result: venue and type as read ("Hotel Continental Sibiu · restaurant"), languages and dish count ("Romanian and English · 14 dishes read · prices in lei, shown in A$"), the week mode badge ("Pre-match", tooltip "Under 16 hours to a match: light, familiar, carbohydrate-forward, nothing fried or heavy."), two or three picks each with the dish as printed, an English gloss, a why sentence, one to three asks and both prices; a "Not tonight" list with reason and tag; the off-menu fallback line ("Nothing appealing? Ask for plain rice or pasta with grilled chicken; most kitchens will do it off-menu."); the safety footer ("Not medical advice. For anything beyond tonight's order, an accredited sports dietitian.").

Approval gate. Fuel proposes; the player orders. "I'm having this" is the only write action: it logs the meal and a Food expense line and nothing else; Fuel never places an order, contacts a venue, edits the dietary profile or changes the budget (M-GATE-1). The toast states the effect, "Logged A$14 to food · tomorrow's check-in will ask how it went" (M-GATE-2), and a log can be undone until midnight local (M-GATE-3).

Failure behaviour. If the photo cannot be read, the card returns to the scan state with "Couldn't read that one. Try closer, flatter, or one page at a time." and no partial picks. If a dish's ingredients cannot be determined, it is omitted from picks or carries "Couldn't read the ingredients: ask before ordering", never a guess. If fewer than two dishes fit, the fallback line leads. If the next match, budget or rate is unavailable, the chip reads "not refreshed". If the ledger write fails, the expense line is queued with a visible retry.

Audit. Each scan records trigger, photo hashes (not the photos), city, mode, model and prompt version, the output validated against the picks schema, cost, and the photo deletion timestamp. Each log records pick, both prices, rate, expense line id, device and time. Each outcome records its source and time.

Cost. Target under A$0.05 per scan including translation, multi-page scans batched into one call; no model call for the outcome question or the history.

## 4. Surfaces and states

### 4.1 Fuel page (`#/fuel`)

Header: the description quoted in section 1, badge "Pro", Preferences.

Context strip `.ctx`, four chips: "Now 21:15 · Sibiu"; "Match tomorrow 10:00 · Q1 vs Petrov" (tooltip "From the Tournament Agent. Picks lean light and carbohydrate-forward when a match is under 16 hours away."); "No pork · no allergies"; "A$34 left for food today".

Scan state: title `#fuelTitle` "Scan a menu", description "Hotel restaurant, room-service card, a place round the corner, or a supermarket shelf. Several pages are fine.", badge `#fuelState` "Ready"; Take photo `#fuTake`, Choose photos `#fuPick`, "Try the hotel menu in Sibiu" `#fuSample`; the line "Photos are read once and deleted within 24 hours. Only the dish you choose is kept." Processing state `#fuProc`: title "One moment", badge "Reading", a spinner with "GPT-4o mini · translating from Romanian · checking against tomorrow's 10:00 match".

Result state `#fuResult`: title "Tonight, at the hotel", description "Three that fit a 10:00 match and A$34. Tap one to log it.", badge "Picks ready"; the menu head; the three `PICKS`: "Piept de pui la grătar cu orez · Grilled chicken breast with rice" (why "Lean protein and plain carbohydrate, nothing that sits heavy at 10:00 tomorrow.", asks "double rice" and "sauce on the side", A$14 and 42 lei); "Paste cu sos de roșii și busuioc · Pasta with tomato and basil sauce" (asks "no cream" and "add grilled chicken", A$12 and 36 lei); "Ciorbă de văcuță · Beef sour soup" (ask "bread on the side", A$9 and 28 lei); each with "I'm having this". "Not tonight · fine on a rest day": "Sarmale cu mămăligă" (Pork), "Mici cu muștar" (Heavy), "Papanași" (Fried). Then the fallback line, Scan another `#fuAgain` and the safety footer.

Logged state: the chosen pick's button reads "Logged"; a ledger line "Dinner · Grilled chicken breast with rice · Hotel Continental" of A$14 in category Food appears in the Financial Agent; a history row "Sibiu · Hotel Continental · Grilled chicken breast with rice, pre-match · tonight · A$14" with the badge "Tell me tomorrow" appears; toast "Logged A$14 to food · tomorrow's check-in will ask how it went".

Where you've eaten ("What worked, by city. The second visit is faster."): rows with flag, city and venue, dish, mode, date, price and outcome: "Genoa · Hotel Bristol · Trofie al pesto, pre-match · 7 Sep · A$22 · Worked"; "Poznań · Restauracja Ratuszova · Pierogi ruskie, post-match · 21 Aug · A$14 · Worked"; "Cluj · room service · Club sandwich, 23:10 after travel · 8 Aug · A$19 · Flat next day".

What Fuel won't do ("On purpose."): "No calorie or weight targets · It answers "what should I order", nothing about your body."; "No supplements"; "Allergies are hard rules · If it can't read an ingredient, it says so rather than guessing."; "Photos aren't kept · Read once, deleted within 24 hours."

Other states: unreadable photo; partial read; fewer than two picks; over budget (price in amber with "over today's food money by A$n"); Rest or Travel mode; offline queue (M-PLAT-2); empty history; Free locked; downgrade read-only.

### 4.2 Quick-actions sheet (`#qa`), sidebar and ledger

The capture button opens the sheet; its second item, "Scan a menu · What to order tonight, for tomorrow's match", navigates to `#/fuel` and focuses Take photo. The sidebar item "Fuel" carries a "New" tag. In the ledger a logged pick is an expense line with source Fuel, both prices, the rate, venue and tournament, and no receipt thumbnail. The next morning the Match Scribe note or Mindset check-in shows one line, "Last night: grilled chicken breast with rice at the hotel. Worked, or flat?".

## 5. Functional requirements

FU-1 (Must). The player can photograph one or more menu pages or choose existing photos, and all pages of one scan are read as one menu.

FU-2 (Must). The agent reads the venue name and type, the languages, the dish count and the menu currency, and states them in the result head.

FU-3 (Must). Every dish is shown as printed with an English gloss, and prices in the home currency with the menu price beside them.

FU-4 (Must). The agent returns two or three picks ranked by fit, fewer only when the rules and mode leave fewer, in which case it says so.

FU-5 (Must). Each pick carries a why sentence for the current mode and one to three asks phrased as words to say to the kitchen.

FU-6 (Must). The week mode is derived from the next match, the last match and travel (section 7) and shown as a badge with a tooltip stating the rule.

FU-7 (Must). Dietary exclusions and allergies are hard filters: no pick may contain an excluded or allergenic ingredient as read, and dishes ruled out that way appear only in "Not tonight" with the reason.

FU-8 (Must). Every pick carries the line "Allergen information is read from the menu and is advisory. Confirm ingredients with the kitchen before ordering.", and when ingredients cannot be read the agent says so rather than guessing.

FU-9 (Must). The result shows a "Not tonight" list of one to three dishes with a reason and a tag (Pork, Heavy, Fried, Allergen, Alcohol, Late), qualified "fine on a rest day" when the reason is the mode rather than a rule.

FU-10 (Must). Every result includes the fallback line and the footer "Not medical advice. For anything beyond tonight's order, an accredited sports dietitian."

FU-11 (Must). The context strip shows time and city, next match, dietary rules and food money left today, marks a stale source "not refreshed", and a pick above the food money left is still shown with its price in amber and the overage stated.

FU-12 (Must). "I'm having this" logs the pick, writes one Food expense line in the menu currency with the day's ECB rate attributed to the current tournament, adds a history row with "Tell me tomorrow", and toasts the amount; it makes no other write, and the log can be undone until midnight local.

FU-13 (Must). Photos are deleted from every store as soon as extraction completes or fails, the deletion is recorded in the audit log, and only the result and the player's choice are retained (M-PRIV-1).

FU-14 (Must). The history lists logged meals by city with flag, venue, dish, mode, date, price and outcome, newest first, and ranks the city's last Worked pick first on a return visit.

FU-15 (Must). The outcome for a logged meal is set by the player's tap (Worked, Flat next day) in the history or the next-day check-in, or inferred from the next day's mood, with the source recorded.

FU-16 (Must). The agent produces no calorie, kilojoule, macronutrient or weight figures, no supplement suggestions and no statements about health conditions; the "What Fuel won't do" card is always present.

FU-17 (Must). Fuel never places orders, contacts venues, edits the dietary profile or alters the budget; the only effect of a scan is the expense line the player creates by logging.

FU-18 (Must). Free players see the locked state with the sample result and one "Start Pro trial" action, and no photo is uploaded.

FU-19 (Should). Supermarket shelf photos return picks phrased as items to buy for the next 24 hours.

FU-20 (Should). Offline scans queue locally with a visible state and are read when connectivity returns (M-PLAT-2).

FU-21 (Should). The dietary profile is editable from the Preferences control as separate exclusion, allergy and preference lists.

FU-22 (Could). A one-line follow-up ("anything with fish?") re-ranks the picks without re-scanning.

FU-23 (Won't, Release 1). Meal planning, grocery lists, restaurant discovery or booking, hydration tracking, wearables.

## 6. Data dictionary

Menu scan (one per scan):

| Field | Type | Source | Notes |
|---|---|---|---|
| id | string | platform | |
| capturedAt, city, country | datetime, string, IOC code | device, tournament | |
| venueName, venueType | string, enum restaurant, room-service, shop, other | agent | |
| pages, photoHashes[] | integer, string | player, platform | photos themselves are not stored |
| languages[] | ISO 639-1 | agent | ro, en in the sample |
| dishesRead | integer | agent | 14 in the sample |
| menuCurrency, rate, rateDate | ISO 4217, decimal, date | agent, ECB | RON in the sample |
| mode | enum pre-match, post-match, travel, rest, practice | computed | section 7 |
| contextSnapshot | object | computed | chips as shown |
| picks[] | array of pick | agent | two or three |
| avoid[] | array of {dish, gloss, reason, tag} | agent | one to three |
| status | enum reading, ready, unreadable, failed | platform | |
| photosDeletedAt | datetime | platform | required for status ready or failed |

Pick: rank (1..3), dishOriginal, dishEnglish, why, asks[] (1..3), priceMenu, priceHome, flags[] (over-budget, ingredients-unread). Meal log: id, scanId, pickRank, loggedAt, city, venueName, dishEnglish, mode, priceMenu, priceHome, rate, expenseLineId, tournamentId, outcome (enum none, worked, flat), outcomeSource (enum tap-history, tap-checkin, inferred-mood), outcomeAt, unloggedAt. Dietary profile: exclusions[] ("no pork"), allergies[], preferences[] ("prefers fish and chicken").

## 7. Business rules and formulas

Week mode: Pre-match when the next match starts within 16 hours; Post-match when the last match ended within 6 hours and no match is within 16 hours; Travel when a travel leg ended within 6 hours or the scan is after 22:00 on a travel day; Rest when the next match is more than 36 hours away and no travel today; Practice otherwise. Pre-match picks are "light, familiar, carbohydrate-forward, nothing fried or heavy"; Post-match leads with protein, fluids and salt; Travel favours something warm, small and quick to digest; Rest lifts the Heavy and Fried restrictions.

Pick ranking: dishes that pass the hard filters are scored for mode fit, familiarity (dishes logged as Worked score higher), preference match and price; the top two or three are shown.

Hard filters: any dish whose read ingredients contain an exclusion or allergen is removed from picks. A dish whose ingredients could not be read is never a pick unless nothing else fits, in which case the confirm line leads its why sentence.

Price conversion: priceHome = priceMenu × ECB reference rate on the scan date (via EUR where no direct rate exists), rounded to a whole unit for display, exact value stored, rate on hover (M-CUR-1). The sample shows 42 lei as A$14, 36 lei as A$12 and 28 lei as A$9.

Food money left today: read from the Financial Agent as the day's food allowance less Food lines logged today; Fuel displays it and never computes or edits it. A pick whose priceHome exceeds it is flagged "over today's food money by A$n".

Outcome: set by the player's tap; if no tap by 18:00 the next day and a note or check-in that day carries a mood, it is inferred as Worked for Confident or Energised and Flat next day for Flat or Frustrated, shown in a lighter badge; otherwise "No feedback".

Second-visit rule: when a scan's city matches a history row with outcome Worked, the result head adds "Last time here: <dish> worked" and that dish, if present and passing the filters, is ranked first.

Retention: photos are deleted the moment the result is stored or the scan fails; the prototype's 24 hours is the outer bound for a queued offline scan.

## 8. Acceptance criteria

FU-AC-1. Given it is 21:15 in Sibiu, Q1 vs Petrov is at 10:00 tomorrow, the profile says no pork and no allergies, and A$34 of food money is left, when the player opens `#/fuel`, then the chips read "Now 21:15 · Sibiu", "Match tomorrow 10:00 · Q1 vs Petrov", "No pork · no allergies" and "A$34 left for food today".

FU-AC-2. Given the player taps "Scan a menu" in the quick-actions sheet, when it closes, then the route is `#/fuel` and Take photo has focus.

FU-AC-3. Given the player photographs the Hotel Continental menu, when reading completes, then the head reads "Hotel Continental Sibiu · restaurant" and "Romanian and English · 14 dishes read · prices in lei, shown in A$" with the badge "Pre-match".

FU-AC-4. Given the result is ready, when the picks render, then exactly three appear in order (grilled chicken breast with rice A$14 and 42 lei; pasta with tomato and basil sauce A$12 and 36 lei; beef sour soup A$9 and 28 lei), each with a why sentence, asks and the confirm-with-the-kitchen line.

FU-AC-5. Given the menu contains "Sarmale cu mămăligă" with pork, when the result renders, then it appears only in "Not tonight" with the tag Pork and a reason naming the player's rule.

FU-AC-6. Given the agent cannot read a dish's ingredients, when the result renders, then that dish is not a pick unless fewer than two others fit, and if shown it carries "Couldn't read the ingredients: ask before ordering".

FU-AC-7. Given the player taps "I'm having this" on the grilled chicken, when the log completes, then the button reads "Logged", the toast reads "Logged A$14 to food · tomorrow's check-in will ask how it went", a Sibiu history row with "Tell me tomorrow" appears, and the ledger holds a Food line of 42 lei at the day's ECB rate showing A$14.

FU-AC-8. Given the player logged a pick at 21:30, when they un-log it before midnight, then the expense line and history row are removed.

FU-AC-9. Given a meal was logged last night, when the player records a note the next morning with mood Confident and does not answer the check-in line, then by 18:00 the history badge reads Worked in the inferred style with source inferred-mood recorded.

FU-AC-10. Given a scan has completed, when the audit log is inspected, then it holds the photo hashes, the deletion timestamp and the result, and no photo bytes exist anywhere.

FU-AC-11. Given the photo is blurred, when reading fails, then the card returns to the scan state with "Couldn't read that one. Try closer, flatter, or one page at a time." and the photo is deleted.

FU-AC-12. Given the home currency is CNY, when the result renders, then every price shows in ¥ with the menu price in lei beside it and the rate on hover.

FU-AC-13. Given a Free player, when they open `#/fuel` or tap "Scan a menu", then the Sibiu sample renders dimmed with one explanation line and one "Start Pro trial" action, and no camera opens.

## 9. Notifications produced

None. Fuel creates no For-you or FYI notifications and does not appear in Settings > Notifications; the next-day outcome question is a line inside the Match Scribe or Mindset check-in that already exists that day, never a separate push or email.

## 10. Sharing scope

Coach: nothing. Manager: the Food expense lines in the ledger (M-SHARE-2), with venue and amount but not picks or outcomes. Public profile: nothing. Export (M-PRIV-2): scan results, meal log and outcomes; photos are never retained.

## 11. Analytics events

menu_scan_started (source, pages), menu_scan_completed (mode, dishesRead, languages, picks, seconds, cost), menu_scan_unreadable, menu_scan_partial, pick_logged (rank, priceHome, overBudget), pick_unlogged, over_budget_shown, outcome_set (value, source), second_visit_hint_shown, preferences_opened, sample_menu_tried. Product KPIs: photo-to-picks median seconds (target under 20), scans ending in a log (target above 60 percent), share of logs with an outcome within 48 hours, Flat-next-day share by mode, hard-filter violations reported (target zero), cost per scan.

## 12. Out of scope and open questions

Out of scope for Release 1: nutrition tracking of any kind; meal plans and grocery lists; restaurant discovery or booking; hydration and sleep; barcode scanning; sharing picks with a coach or physio.

Open questions: the 16-hour, 6-hour and 36-hour mode thresholds in section 7 and the cost target in section 3 are placeholders; whether the daily food allowance is a seventh of a weekly food line or set by the player, and where in PRD-03 it lives; whether the outcome should ever be inferred from mood, given that a flat morning has many causes; whether the "Pro" badge and the sidebar "New" tag belong in Release 1 given PRD-00 defines only the Elite "Early access" badge (M-TIER-4); whether the confirm-with-the-kitchen line needs jurisdiction-specific review alongside the distress card (PRD-00 section 10).

Inconsistencies found between the prototype and PRD-00. Location: the Fuel page places the player in Sibiu on 12 September the night before "Q1 vs Petrov", while the rest of the prototype has her leaving Genoa after a Q2 loss on 11 September, Sibiu as an undecided week 41 shortlist event, and Petrov as the Genoa Q1 opponent she beat; the ledger line is attributed to "M25 Sibiu". Retention: the prototype says photos are "deleted within 24 hours", while M-PRIV-1 says menu photos are "read once and deleted after extraction"; section 7 makes extraction the deletion point and the UI copy should change. Money model: logging a pick decrements reserves directly (`F.reserves -= p.aud`) and writes a ledger line in A$ only, whereas M-DATA-1 requires the original currency and rate to be stored and treats reserves as manually entered balances; the line should carry 42 lei and the rate. Rate display: no rate or source is shown as M-CUR-1 requires, and the rounding is uneven (42 and 36 lei imply 3.0 lei per A$, 28 lei 3.1). Dietary source: the chip says "From onboarding" and the toast "edit in Settings", but onboarding has no dietary step and Settings no Fuel pane. Budget: the chip cites a "food line of this week's A$1,200 budget", but PRD-00 defines a weekly travel budget with no daily food line. Data model: Fuel is in PRD-00's tier table but absent from the shared data model in section 5.3. Provider: the prototype names "GPT-4o mini"; PRD-00 names only a structured-output LLM. Safety wording: the card promises that allergies are hard rules but the picks carry no confirm-with-the-kitchen line; FU-8 adds it. Gating: the quick-actions sheet is available to all tiers and "Scan a menu" leads straight to the camera, while PRD-00 gates Fuel to Pro and Elite.
