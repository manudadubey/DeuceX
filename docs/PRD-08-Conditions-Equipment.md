# PRD-08 · Conditions and Equipment

Version 0.1 · 12 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: the Conditions brief and racquet visual inside the Tournament Agent detail on `#/agent/tournament` (`.cond`, `.rq`, `.test`, `rqHeadT`), the Conditions chip on the dashboard decision card on `#/` ("17–22°C · Dunlop Fort · keep 24/23 kg"), the `cond` object on each `T` entry, the `.stamp` chips on Match Scribe notes on `#/match-scribe`, the physical pattern with the "Conditions" badge on `#/agent/mindset` and `#/coach`, the Equipment pane on `#/settings` (`data-st-pane="equip"`), and the unit engine (`toU`, `convT`, `applyUnit`, `setUnit`, `pc.unit`).

---

## 1. Purpose and job to be done

The layer exists because of one week. At an M25 in Anning in August, Arya served at 48 percent in 33°C and 82 percent humidity two days after an indoor session in which every ball landed. She changed nothing on the racquet and wrote "I do not understand it" in her note. Hot, humid air lets the ball fly; polyester loses tension faster; a different tournament ball fluffs and slows on clay. A player with a stringer knows this. A player travelling alone finds out in the first round.

Conditions and Equipment reads the venue forecast and the tournament fact sheet for every shortlisted event, compares them with what the player practises with, and writes a short brief: what the air, court and ball will do, how many frames to bring, grip, when to practise, and whether a tension test is worth running. Where it proposes a test it shows two frames side by side, baseline and test, and says who decides: "You and your stringer decide; the brief only proposes the test." It then stamps every match note with the conditions it was played in, so the Mindset Coach can tell a physical pattern from a mental one.

Job statement: "Before I travel, tell me what the air, the court and the ball will do to my game at this event, what to pack, and whether I should string one frame differently for the first hit, so that Anning never happens again without me knowing why."

Success: every shortlisted event carries a brief before its entry deadline; every Match note during an Entered event carries a stamp; the player reports the tension test as useful in more than half of post-event check-ins.

## 2. Users and entitlements

Player on Free: the brief only (PRD-00 section 4) inside the Tournament Agent detail, without the racquet visual, the tension test, note stamps or the physical pattern; those areas render in the locked state (M-TIER-1). Player on Pro or Elite: full layer, including tension tests, stamps, the equipment profile and the physical pattern. Coach via share link: the brief for each shortlisted event and the physical pattern (M-SHARE-1). Manager via share link: nothing. A stringer has no share scope in Release 1 (PRD-00 section 10 open question); the player forwards the test by their own means.

## 3. Agent contract

Trigger. Runs inside every Tournament Agent run (Sunday 20:00 UTC and on demand) for each shortlisted candidate; daily inside the travel window for Entered events and once more the day before travel (the label reads "forecast for match days, refreshed the day before you travel"); at Match note save time to produce a stamp; and when the equipment profile is saved.

Inputs. Tournament fact sheet (ball, surface, indoor or outdoor, coordinates, altitude, match days, likely first-round slot); the hourly forecast over the match days; the equipment profile (frame, string, baseline tension in kg, frames carried, restring cadence, overgrip, practice balls); the units preference; the last event's stamps for comparison text ("Cooler and slower than Genoa"); Match notes with performance figures for the physical pattern.

Outputs. One Conditions brief per candidate (data dictionary in section 6) with a one-line chip for the dashboard; a stamp array per Match note; physical pattern candidates for the Mindset Coach when the pattern rule fires (section 7); a "brief refreshed" FYI notification the day before travel when a recommendation changed.

Approval gate. The layer changes nothing: it never edits the profile, books a stringer or sends anything. The two-frame test is a proposal acted on outside the app. The Equipment pane says so: "Conditions briefs use this to suggest tension tests and how many frames to bring; they never change anything for you."

Failure behaviour. If the forecast is unavailable the brief renders from the fact sheet and climate normals with the Air tile marked "not refreshed · normals for October" and no tension test is proposed. If the fact sheet lacks the ball, the Ball tile reads "Ball not published yet". If a stamp cannot be produced at save the note saves without one and is backfilled within 24 hours (PRD-02). No failure blocks the Tournament Agent run.

Audit. Each brief records forecast source and fetch time, fact-sheet version, equipment profile version, rule outcomes (air amber, ball differs, test proposed) and the prose with model and prompt version; each stamp records forecast time and note id (M-GATE-4).

Cost. Forecast calls are cached per venue and day; prose generation is one call per brief per run, target under A$0.03; stamps need no model call.

## 4. Surfaces and states

### 4.1 Conditions brief in the tournament detail (`#/agent/tournament`)

Label "Conditions brief · forecast for match days, refreshed the day before you travel". Four tiles: Air (temperature range, amber per section 7; sub-line "55–65% humidity · wind 8–14 km/h"), Court (indoor or outdoor plus surface; sub-line "80 m altitude"), Ball (name, amber when it differs from the practice ball; sub-line "differs from your practice ball" or "same as practice"), Frames to bring (count; sub-line "Normal grip" or "Fresh overgrip every set"). Below the tiles the prose joining `diff` and `practice` ("Cooler and slower than Genoa. Balls will feel heavier by set three. Afternoon sessions match your 13:00 first-round slot.").

Racquet visual `.rq`: an SVG racquet with mains in chart-2 and crosses in chart-4 (`rqHeadT` clip path), a legend with Mains and Crosses ("24 kg", or "24 → 25 kg" when a test is proposed), the string and frame line ("Luxilon Alu Power 1.25 · full bed · Wilson Blade 98") and an inline "show in lb" toggle. The two-frame test `.test`: Frame A · baseline · kg, "24 / 23", "What you played Genoa with"; Frame B · test · kg, "25 / 24" with the tension note, or Frame B · not needed, "24 / 23", "Keep 24/23. Cooler air holds tension; no test needed." The recommended frame is outlined in lime. Footer: "Ten minutes of serves with each in the real conditions, then choose. You and your stringer decide; the brief only proposes the test."

States: fresh; not refreshed (Air tile on normals); ball unknown; test proposed (Frame B outlined) or no test (Frame A outlined); Free locked (tiles visible, racquet and test dimmed with one upgrade action); refreshed since last view (badge "Refreshed Wed 24 Sep" for 24 hours).

### 4.2 Dashboard chip (`#/`)

One chip on the decision card: "17–22°C · Dunlop Fort · keep 24/23 kg" with the tooltip "From the Conditions brief: 17–22°C, 55–65% humidity, Dunlop Fort. Cooler than Genoa; keep your baseline tension, bring 3 frames." When a test is proposed the chip reads "24–29°C · Wilson US Open · test 25/24 kg".

### 4.3 Stamps on Match Scribe notes (`#/match-scribe`)

In review: "Conditions · attached automatically" with chips for temperature, humidity, indoor or outdoor plus surface, ball and place ("24°C", "58% RH", "outdoor clay", "Dunlop Fort", "Genoa"). On past notes the same chips sit in the footer with the tooltip "Attached automatically from the venue forecast and the tournament fact sheet at match time."; the first two turn amber at 28°C and 70 percent (the Anning note shows 33°C and 82% RH amber). States: stamped, unstamped (switch off or no Entered event), pending backfill ("Conditions pending").

### 4.4 Physical pattern (`#/agent/mindset`, `#/coach`)

Rendered by PRD-06 with the "Conditions" badge, "See the tension test" and evidence dots. Prototype text: "First serve drops in heat and humidity, tension unchanged · China week: 48% first serves at 33°C and 82% humidity, two days after an indoor session where every ball landed. Same string, same tension. Genoa at 24°C: 62%. Not your arm; the ball flies further in hot air and the poly goes softer. The Lisbon and Antalya briefs already propose a one-kilo test." "One-kilo" becomes "two-pound" under Imperial (`convT`).

### 4.5 Settings > Equipment (`#/settings`, `data-st-pane="equip"`)

Header "Equipment · What you play with." with the kg / lb segmented control top right, and the racquet visual with Mains and Crosses in the current unit. Fields: Frame ("Wilson Blade 98 · 16×19 · 305 g"), String ("Luxilon Alu Power 1.25 · full bed"), Tension · mains / crosses ("24 / 23" with the unit suffix and "Your indoor baseline. Briefs quote changes against this. Switch units top right; 1 kg is about 2.2 lb."), Frames you travel with (3 to 6, default 4), Restring cadence (Every match, Every 8–10 sets, When it feels dead), Overgrip ("Tourna Grip · fresh every match in heat"), Balls you practise with (Dunlop Fort, Head Tour, Wilson US Open, Babolat Team; "The brief flags it when it differs from what you've been hitting."). A switch "Stamp Match Scribe notes with conditions" ("Patterns need this on.", default on). Save with the toast "Saved · next brief uses the new baseline". States: saved, unsaved changes, Free locked (profile editable, stamp switch and tension advice locked).

### 4.6 Unit engine

`pc.unit` persists kg or lb. The Equipment control, the inline "show in lb" link and the Preferences Units toggle (Metric or Imperial) are synced two ways; changing any one shows "Tension shown in lb" and re-renders the detail, the chip, the Equipment pane and the patterns.

## 5. Functional requirements

CE-1 (Must). Every shortlisted candidate carries a Conditions brief produced in the same run as the shortlist, embedded in the Tournament Agent detail and summarised in one chip on the decision card.

CE-2 (Must). The brief's Air tile shows the forecast temperature range for match days with humidity and wind, and turns amber when the forecast maximum reaches 28°C or the humidity 70 percent.

CE-3 (Must). The Court tile states indoor or outdoor and the surface, with altitude from the fact sheet or venue coordinates.

CE-4 (Must). The Ball tile names the tournament ball from the fact sheet and turns amber with the line "differs from your practice ball" when it is not among the balls selected in Equipment.

CE-5 (Must). The brief states frames to bring and grip advice, derived from the rules in section 7 and the frames-carried setting.

CE-6 (Must). The brief's prose is a comparison sentence against the player's most recent stamped event plus a practice sentence, generated once per run and never contradicting the tiles.

CE-7 (Must). The forecast is refreshed daily inside the travel window and once more the day before travel; a change in any recommendation after refresh produces one FYI notification.

CE-8 (Must). The racquet visual shows mains and crosses at the baseline tension, or as "baseline → test" when a test is proposed, in the player's unit.

CE-9 (Must). A two-frame test is proposed only when the tension rule fires (section 7); Frame A shows the Equipment baseline and Frame B the test values, with the recommended frame outlined and the tension note quoted.

CE-10 (Must). The brief never changes the equipment profile and always carries the sentence "You and your stringer decide; the brief only proposes the test."

CE-11 (Must). Match notes saved during an Entered event while the stamp switch is on receive a stamp of temperature, humidity, indoor or outdoor plus surface, ball and place from the match-time forecast and the fact sheet.

CE-12 (Must). Stamp chips turn amber at 28°C and at 70 percent humidity and carry the tooltip explaining their source.

CE-13 (Must). A physical pattern candidate is emitted to the Mindset Coach when the pattern rule fires, with the stamp values and performance figures it rests on, and renders with the "Conditions" badge and "See the tension test".

CE-14 (Must). "See the tension test" opens the detail of the nearest shortlisted event whose brief proposes a test.

CE-15 (Must). The equipment profile is editable in Settings > Equipment and saving it triggers a re-run of every current brief with the toast "Saved · next brief uses the new baseline".

CE-16 (Must). The unit preference converts every tension value at display time as kg × 2.2046 rounded to the nearest pound, and rewrites "24/23" patterns, "a kilo" to "two pounds" and "one-kilo" to "two-pound" inside brief and pattern prose (M-CUR-2).

CE-17 (Must). The kg / lb control, the inline "show in lb" link and the Preferences Units toggle stay in sync in both directions, and the stored baseline remains in kg regardless of display unit.

CE-18 (Must). Temperature displays follow the units preference (°C or °F) in tiles, chips and stamps, and the amber thresholds are evaluated on the stored Celsius value.

CE-19 (Must). When the forecast is unavailable the brief renders from climate normals, marks the Air tile "not refreshed", and proposes no tension test.

CE-20 (Must). Free players see the four tiles and the prose; the racquet visual, the test, the stamps and the physical pattern render in the locked state with one upgrade action.

CE-21 (Should). After an Entered event ends, a one-question check-in asks whether the tension test helped (Yes, No, Didn't run it) and the answer is stored against the brief.

CE-22 (Could). The brief for an Entered event shows the hourly forecast for the scheduled match hour once the order of play is known.

CE-23 (Won't, Release 1). A stringer share scope, string or ball purchasing links, and any automatic change to the profile.

## 6. Data dictionary

Conditions brief (one per candidate per run; the prototype's `cond` object):

| Field | Type | Source | Notes |
|---|---|---|---|
| tournamentId, runId | string | platform | |
| temp | range in °C, or "19°C indoor" | forecast | displayed via units |
| tempMax | decimal °C | forecast | drives the amber rule |
| rh | range in percent | forecast | "55–65%" |
| rhMax | integer | forecast | drives the amber rule |
| wind | string | forecast | "15–25 km/h · Atlantic", "None" indoors |
| alt | metres | fact sheet or elevation lookup | "415 m" |
| ball | string | fact sheet | "Head Tour"; null when unpublished |
| ballDiff | boolean | computed | ball not in practice set |
| io | string | fact sheet | "Outdoor clay", "Indoor hard" |
| diff | string | agent | comparison sentence |
| tension | 0 or 1 | rule | 1 proposes a test |
| tensionNote | string | agent | passes through `convT` |
| testMains, testCrosses | kg | rule | baseline + 1 each when tension = 1 |
| frames | integer | rule | 3 to 6 |
| grip | string | rule | "Normal grip", "Fresh overgrip every set" |
| practice | string | agent | practice sentence |
| forecastAt, source, refreshed | datetime, string, boolean | platform | for the label and audit |

Equipment profile (owned here): frame, string, mainsKg, crossesKg, framesCarried (3..6), restringCadence (everyMatch, every8to10Sets, whenDead), overgrip, practiceBalls (array), stampNotes (boolean), updatedAt, version.

Stamp (attached to a Note): temp °C, rh percent, io, ball, place, forecastAt, backfilled (boolean); rendered as the `cond` array ['33°C','82% RH','outdoor hard','Head Tour'].

Physical pattern candidate (sent to PRD-06): metric (firstServePct, secondServeFaults), hotSamples [{noteId, value, temp, rh}], coolSamples, delta, statement draft, evidence note ids.

## 7. Business rules and formulas

Amber thresholds. Air is amber when tempMax ≥ 28°C; humidity when rhMax ≥ 70 percent. Stamps apply the same thresholds to the single match-time values. Both are fixed by the prototype.

Ball difference. ballDiff is true when the fact-sheet ball is not in practiceBalls; the Ball tile is amber and the practice sentence includes the ball ("Hit with Head Tour from Wednesday, not Dunlop.").

Tension rule. tension = 1 for an outdoor event when tempMax ≥ 28°C, or alt ≥ 400 m together with ballDiff, or rhMax ≥ 70 percent together with wind above 15 km/h. Indoor events never propose a test. When tension = 1, testMains = mainsKg + 1 and testCrosses = crossesKg + 1 (24/23 becomes 25/24); the note names the driver ("Altitude plus a livelier ball pushes the same way as heat."). When tension = 0 the note says why not ("Cooler air holds tension; no test needed."). The one-kilogram step is the prototype's value and a placeholder for review with stringers.

Frames to bring. frames = 3 by default; 4 when tension = 1; 5 when tension = 1 and tempMax ≥ 29°C, with the advice "restring after every match in this heat"; never more than framesCarried, and when the rule wants more the sub-line reads "you carry 4; bring them all". The prototype shows 3 for Poznań and Bratislava, 4 for Sibiu and Lisbon, 5 for Antalya.

Grip. "Fresh overgrip every set" when rhMax ≥ 70 percent or tempMax ≥ 28°C, otherwise "Normal grip".

Practice hour. When the first-round slot is known the practice sentence names it ("Afternoon sessions match your 13:00 first-round slot."); in heat it says to hit at match hour ("Hit at 13:00 in the sun, not 08:00.").

Refresh. Forecast fetched at every shortlist run; daily from seven days before the first match day of an Entered event; and once more at 18:00 local the day before travel (or, absent an itinerary, the day before the first match day). A refresh that flips tension, ballDiff, frames or the amber state produces the FYI notification.

Unit conversion. toU(kg) = round(kg × 2.2046) when the unit is lb; text rewriting replaces every "dd/dd" pair, "a kilo" with "two pounds" and "one-kilo" with "two-pound"; the stored profile stays in kg; temperature converts as °F = °C × 9 ÷ 5 + 32 for display.

Physical pattern rule. For a metric mentioned in at least two stamped Match notes, compare the mean in hot samples (temp ≥ 28°C or rh ≥ 70 percent) with the mean in cool samples; emit a candidate when both sets have a sample, the delta is at least 10 percentage points for first-serve percentage (placeholder), and the equipment version was unchanged ("Same string, same tension."). The prototype's candidate rests on 48 percent at 33°C and 82 percent against 62 percent at 24°C.

## 8. Acceptance criteria

CE-AC-1. Given Poznań is selected after the Sunday run, when the detail renders, then Air shows "17–22°C" not amber with "55–65% humidity · wind 8–14 km/h", Court "Outdoor clay · 80 m altitude", Ball "Dunlop Fort · same as practice", Frames to bring 3 with "Normal grip", and Frame A "24 / 23" is outlined with Frame B "not needed" reading "Keep 24/23. Cooler air holds tension; no test needed."

CE-AC-2. Given Sibiu is selected, when the brief renders, then Ball shows "Head Tour" in amber with "differs from your practice ball", Court shows "415 m altitude", Frame B shows "25 / 24" outlined with "Test 25/24 against 24/23 in the first hit. Altitude plus a livelier ball pushes the same way as heat.", and Frames to bring is 4.

CE-AC-3. Given Antalya is selected with a forecast of 29–33°C and 55–70 percent humidity, when the brief renders, then Air is amber, Frames to bring is 5 with "Fresh overgrip every set", Frame B proposes "25 / 24" with "Up a kilo, and restring after every match in this heat.", and the prose ends "Hit at 13:00 in the sun, not 08:00."

CE-AC-4. Given Bratislava (indoor hard, 19°C) is selected, when the brief renders, then Court shows "Indoor hard", wind shows "None", no test is proposed and Frame A is outlined.

CE-AC-5. Given Lisbon's brief proposes a test, when the dashboard decision card names Lisbon, then its Conditions chip reads "24–29°C · Wilson US Open · test 25/24 kg" and the tooltip names the humidity range and frame count.

CE-AC-6. Given the player taps "show in lb" in the Poznań brief, when the detail re-renders, then Mains reads "53 lb", Crosses "51 lb", Frame A "53 / 51", the toast reads "Tension shown in lb", the Equipment control shows lb and Preferences Units shows Imperial.

CE-AC-7. Given the unit is lb and Lisbon is selected, when the brief renders, then the tension note reads "Go up two pounds: 55/53. Test both frames in the wind on day one." and the physical pattern on `#/agent/mindset` reads "a two-pound test".

CE-AC-8. Given the unit is lb, when the player opens Settings > Equipment, then the Tension field shows "53 / 51" with the suffix "lb", the racquet legend shows 53 lb and 51 lb, and saving keeps 24 and 23 kg in the stored profile.

CE-AC-9. Given Arya saves a Match note on 11 Sep during Genoa Q2 with the stamp switch on, when the note is stored, then its stamp is ['24°C','58% RH','outdoor clay','Dunlop Fort','Genoa'] with no amber chip, and the review showed "Conditions · attached automatically".

CE-AC-10. Given the 14 Aug Anning note with 33°C and 82% RH, when Past notes renders, then the 33°C and 82% RH chips are amber, "outdoor hard" and "Head Tour" are not, and the tooltip reads "Attached automatically from the venue forecast and the tournament fact sheet at match time."

CE-AC-11. Given the Anning note reports 48 percent first serves at 33°C and 82 percent and the Genoa Q2 note 62 percent at 24°C with the same equipment version, when the pattern rule runs, then a physical candidate is emitted, the Mindset Coach shows it with the "Conditions" badge, and "See the tension test" opens Lisbon's or Antalya's detail.

CE-AC-12. Given Arya changes her baseline to 25 / 24 in Equipment and taps Save, when the toast "Saved · next brief uses the new baseline" appears, then every current brief re-runs, Frame A reads "25 / 24" and any proposed test reads "26 / 25".

CE-AC-13. Given the forecast provider is unavailable for Sibiu, when the run completes, then the Air tile reads "not refreshed · normals for October", no test is proposed, the rest of the brief renders, and the Tournament Agent run is not marked failed.

CE-AC-14. Given Lisbon is Entered and the day-before-travel refresh moves the forecast maximum from 27°C to 30°C, when the refresh completes, then Air turns amber, tension flips to a test, and one FYI notification "Lisbon brief refreshed" is sent.

CE-AC-15. Given a Free player opens Sibiu's detail, then the four tiles and prose are visible, the racquet visual and two-frame test are dimmed with one "Start Pro trial" action, and no stamps appear on their notes.

## 9. Notifications produced

FYI: "<Event> brief refreshed" with body stating what changed ("Forecast now 24–30°C. A 25/24 test is proposed; bring 4 frames.") and action Open, only when a refresh changes a recommendation, at most one per event per day. FYI: "Ball published for <Event>" when a fact sheet gains its ball after the brief was first produced and the ball differs from practice. No For-you notifications; nothing here needs a decision inside the app.

## 10. Sharing scope

Coach: the full brief for each shortlisted event (tiles, prose, test) and the physical pattern with its stamp values (M-SHARE-1). Manager: nothing. Public profile: nothing. Stringer: no scope in Release 1. Export (M-PRIV-2): briefs, equipment profile versions, stamps and pattern candidates.

## 11. Analytics events

brief_generated (tournamentId, tension, ballDiff, airAmber, frames), brief_viewed, brief_refreshed (changed fields), tension_test_viewed, unit_toggled (from, to, surface), equipment_saved (changed fields), stamp_attached (backfilled), stamp_switch_changed, physical_pattern_emitted (metric, delta), tension_test_opened_from_pattern, post_event_test_checkin (answer). Product KPIs: share of shortlisted events with a brief before deadline (100 percent), share of Match notes during Entered events with a stamp (target 95 percent), test usefulness rate from the post-event check-in (target above 50 percent), unit toggle usage by country.

## 12. Out of scope and open questions

Out of scope for Release 1: a stringer share scope or accounts, string and ball purchasing, court-speed ratings, hydration or heat-illness advice (health guidance belongs to no agent), shoe and apparel advice, automatic profile changes.

Open questions and placeholders: the one-kilogram test step (and whether half a kilogram suits low baselines); the frames-to-bring ladder (3, 4, 5) inferred from the prototype's five briefs; the 400 m altitude threshold; the 10-point first-serve delta for the physical pattern; whether the 28°C and 70 percent thresholds should differ by surface or for indoor events with poor climate control; whether the day-before-travel refresh should read the itinerary from the Financial Agent's flight expense; whether a stringer scope belongs in Release 1 (PRD-00 section 10).

Inconsistencies found in the prototype: the Air tile's amber logic reads only the lower bound of the range (`temp.slice(0,2)` after a check that the string starts with "2"), so "24–29°C" is not amber and a single value like "33°C" is never evaluated; this document specifies the forecast maximum. Frames you travel with defaults to 4 while the Antalya brief says bring 5; the rule in section 7 caps at frames carried, so Antalya needs the profile at 5 or the sub-line "you carry 4; bring them all". The racquet legend's string line is hard-coded rather than read from the profile. The Free "brief only" entitlement sits inside a Tournament Agent detail whose cost columns are locked on Free (PRD-01), so the brief is the only live content in that panel for Free players.
