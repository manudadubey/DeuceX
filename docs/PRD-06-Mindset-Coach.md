# PRD-06 · Mindset Coach

Version 0.2 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/agent/mindset` (insight, check-in, boundaries, mood chart `#moodChart`, patterns `#patterns`, recent mornings), the Mindset Coach card and mood row on `#/`, the check-in card on `#/match-scribe`, "Patterns from the notes" on `#/coach`, the Mindset Coach row in Settings > Agents and "Someone to call" in Settings > Connections.

---

## 1. Purpose and job to be done

A player on the ITF and Challenger circuit loses most weeks. The losses are written up in Match Scribe in the heat of the moment; nobody reads them back, and the same sentence ("rushed the second serve at 5-5") recurs for months without anyone noticing. A sports psychologist would notice, and costs more than the weekly budget. The Mindset Coach is the reading-back. Every morning it reads the last 30 days of notes and check-ins, the ranking line and the next two weeks of schedule, and writes two or three sentences in the player's own language: one observation, one focus. When the same thing shows up in three or more notes it names a pattern, shows the evidence, and lets the player say it is wrong.

The prototype's header states promise and boundary: "One insight a morning, drawn from what you said after matches. Specific, warm, and never a lecture. It's a coach, not a therapist, and it says so." Job statement: "Each morning, tell me one true thing about how I have been playing and feeling, drawn from my own words, give me one thing to focus on today, and stay quiet when I need to play."

Success: the insight is read on at least 60 percent of delivered mornings; the focus is marked done on at least half of those days; patterns are dismissed less than 25 percent of the time; no player ever receives clinical language about themselves.

## 2. Users and entitlements

Player on Free: the daily insight only (PRD-00 section 4); the check-in works, and the chart, patterns, boundaries and recent mornings render locked (M-TIER-1) with one "Start Pro trial" action. Player on Pro or Elite: everything, including the physical Conditions pattern fed by PRD-08. Coach via share link: pattern statements, confidence and evidence counts, never the transcript, never moods by date (M-SHARE-1); the coach page says "You see the pattern, not the words." Manager via share link: nothing. Players under 18: the same coach, with youth crisis lines where the country has one (section 12). The coach starts after the third saved note (onboarding copy: "Starts after your third Match Scribe note. It needs something to read first.").

## 3. Agent contract

Trigger. Scheduled daily at 06:00 in the player's time zone (Settings > Agents offers 06:00, 07:00 or Evenings 21:00; Elite can set any cadence in Agent Studio). On match mornings with "Quiet on match mornings" on, the run is stored but not delivered until the evening note. Suppressed while "Pause for a week" is on. Pattern detection also runs in the overnight analysis at 02:00 UTC after any saved note.

Inputs. Notes and check-ins from the last 30 days (transcripts, moods, tags, condition stamps), the focus history, the ranking snapshot, the next 14 days of Entered events, the previous 14 insights and feedback, active patterns with dismissed flags, the first patron language, and semantic search over the whole note history for one older quote.

Outputs. One insight (two or three sentences, 40 to 90 words), one focus sentence, an optional memory quote with date and context, a pattern flag when a pattern is new or strengthened, Pattern updates, and one FYI notification "This morning's insight is ready" whose body is the first sentence; or the distress card when the rule fires (section 7). Never more than one notification per run (M-NOTIF-1).

Approval gate. The coach takes no external action and produces no message to anyone but the player. The player's controls are the feedback pair, the focus checkbox, pattern dismissal and the boundary switches. Pattern statements reach the coach link only while "Coach sees patterns, not notes" is on.

Failure behaviour. If the run fails, the page keeps yesterday's insight with the banner "This morning's run didn't complete" and no notification is sent; the platform retries three times with backoff. If the insight fails the language or tone check (section 7) it is regenerated once and otherwise withheld, the card reading "Nothing from the coach this morning. Your notes are still being read." With fewer than three notes in the window the coach writes from check-ins only and says so.

Audit. Each run records trigger, input snapshot hash, model and prompt version, the validated structured output, tone-check result, language, the distress evaluation and its inputs, delivery time and cost. Feedback, focus completion and dismissals are recorded with player, time and device (M-GATE-4).

Cost. Target under A$0.08 per delivered insight; pattern detection is incremental.

## 4. Surfaces and states

### 4.1 Mindset Coach page (`#/agent/mindset`)

Header: title, the description quoted in section 1, badge "Claude Sonnet · 06:00 your time", and How it works ("Reads your last 30 days of notes and check-ins, your ranking line and the next two weeks of schedule. Writes two or three sentences. Nothing else."). A Recent mornings card lists each day's first line, focus and a badge Done, Skipped or Quiet.

Today card: date, provenance line ("From four notes, two check-ins, a ranking up 14 places, and Poznań in sixteen days."), a "Pattern flag" badge when a pattern is new or strengthened, the insight, the focus row `#focusRow` (badge "Tap when done" becoming "Done · 4 of the last 5"), the memory block ("Something you said six months ago, found by meaning rather than date", with the quote and its source "M25 Antalya · 14 March · after losing to Kovalenko 7-6 6-3"), and a footer with "Was this useful?" Yes, Not today and "Read the notes it used".

Check-in card: "Thirty seconds. It's the second thing the coach reads, after your notes." A 1 to 5 group `#mcMood` labelled "This morning · 1 flat, 5 energised", an optional sentence, Save.

Your boundaries card: "You decide when it speaks and who sees what." Switches "Quiet on match mornings" (default on), "Coach sees patterns, not notes" ("Your coach link shows 'rushing the second serve, 3 of 4', never the transcript.", default on), "Pause for a week" (default off). Then the care block: "If a run of notes reads like more than a bad week, the coach stops coaching and points you to real people: the ATP Player Assistance line, Lifeline (13 11 14), or whoever you've named in Settings. It won't pretend to be them."

Mood chart card: "How you've felt, against what happened", solid dots for note moods and hollow dots for check-ins, W and L along the bottom, a range control (30 and 90 days), five rows (Energised, Confident, unlabelled middle, Flat, Frustrated), shaded tournament weeks (Genoa, Poznań, Cluj, Liberec, Bratislava) and the dashed callout "tiebreak loss · 'rushing' · 3 of 4" in the 30-day view.

Patterns card: "Each one needs at least three notes to count. You can tell it when it's wrong." Each pattern: statement, confidence badge (Strong amber, Emerging secondary), the "Conditions" badge on physical patterns (tooltip "A physical pattern, built from the condition stamps on your notes rather than what you said."), explanation, actions ("See the tension test" on physical patterns, "Show the notes", "Not a pattern"), and evidence dots with "3 of 4 notes". Dismissed: dimmed, "Dismissed. The coach won't bring this up again unless it happens twice more.", Undo.

States: normal; quiet morning ("Match day. The coach is quiet until your evening note."); paused ("Paused until <date>", Resume now); empty ("Record three notes and the coach starts reading"); run failed; Free locked; distress (section 4.4).

### 4.2 Dashboard card and mood row (`#/`)

Agent card "Mindset Coach · Today · 06:00" with a "Pattern" badge, the insight's first sentence, "Today's focus" and the mood row `#moodRow` (toast "Mood logged: 4/5").

### 4.3 Coach view (`#/coach`, Patterns from the notes)

"You see the pattern, not the words." One block per shared pattern with statement, confidence badge, Conditions badge where applicable, explanation and evidence dots. No moods, dates or transcripts.

### 4.4 Someone-to-call card

Replaces the insight when the distress rule fires: one non-clinical sentence in the player's language ("This reads like more than a bad week. Coaching can wait."), the named contact from Settings > Connections ("Gerhard B. · +43 664 …"), the ATP Player Assistance line and the local crisis line, each tap-to-call. No dismiss control; it stays until the next run (M-PRIV-3).

## 5. Functional requirements

MC-1 (Must). The coach runs once a day at the configured local time and produces one insight of two or three sentences, one focus sentence, and at most one FYI notification.

MC-2 (Must). The insight is written in the first language of the "Patron updates written in" set (M-LANG-3) and quotes the player's notes in the language they were spoken.

MC-3 (Must). The insight cites only material in its inputs and its provenance line states the counts used.

MC-4 (Must). The coach never diagnoses and never uses clinical vocabulary about the player; a blocklist and tone check run on every output, and a failing output is regenerated once or withheld (M-PRIV-3).

MC-5 (Must). The check-in is a five-state scale from 1 to 5 labelled "1 flat, 5 energised" with an optional sentence, saved from the Mindset page, the dashboard or Match Scribe; a later save the same day replaces the earlier one.

MC-6 (Must). The mood chart plots note moods (solid dots, Frustrated 1, Flat 2, Confident 4, Energised 5) and check-ins (hollow dots) on one five-row scale, with W and L results and shaded tournament weeks, over a 30-day or 12-week range.

MC-7 (Must). A mental pattern exists only when at least three notes within 90 days support it, and its evidence dots show which candidate notes do ("3 of 4 notes").

MC-8 (Must). A physical pattern is created from condition stamps supplied by PRD-08, carries the "Conditions" badge and "See the tension test", and states the stamp values ("48% first serves at 33°C and 82% humidity").

MC-9 (Must). Pattern confidence is Emerging or Strong (section 7), shown as a badge on the player page and the coach page.

MC-10 (Must). "Show the notes" opens Match Scribe filtered to the evidence notes; "See the tension test" opens the Tournament Agent detail of the nearest event whose brief proposes one.

MC-11 (Must). "Not a pattern" dismisses the pattern (toast "Okay. Dismissed, and the coach heard you."), excludes it from insights and the coach link, and re-raises it only after two further supporting notes; Undo restores it.

MC-12 (Must). The focus can be marked done from the focus row; the badge changes to "Done · N of the last 5" and completion feeds the next insight.

MC-13 (Must). The feedback pair records Yes or Not today per insight; three "Not today" in seven days change the prompt strategy (section 7), and the toast says so ("Noted · the coach will change tack tomorrow").

MC-14 (Must). "Quiet on match mornings" (default on) withholds delivery on any day with a match in an Entered event; Recent mornings reads "Match day, stayed quiet" with the focus carried over.

MC-15 (Must). "Pause for a week" stops delivery for seven days, shows the resume date, resumes automatically and deletes nothing.

MC-16 (Must). The someone-to-call card replaces the insight whenever the distress rule fires, lists the named contact, the ATP Player Assistance line and the local crisis line as tap-to-call actions, and has no dismiss control and no disabling setting (M-PRIV-3).

MC-17 (Must). After a Travel note or a check-in of 2 or lower, the insight is one sentence, the focus is rest-oriented and no pattern is raised ("The coach now says less on those mornings").

MC-18 (Must). The memory quote is drawn by semantic similarity from the player's own notes, shows its date and context, and is omitted below the similarity threshold.

MC-19 (Must). The coach link shows pattern statements, confidence and evidence counts only while "Coach sees patterns, not notes" is on, never check-ins, moods by date or transcripts.

MC-20 (Must). Free players receive the insight and can check in; patterns, chart, boundaries and recent mornings render dimmed with one "Start Pro trial" action.

MC-21 (Should). Recent mornings lists the last 14 insights with first line, focus and status, and the delivery time can be moved to 07:00 or 21:00 in Settings > Agents.

MC-22 (Could). The player can read the insight in a second patron language with one tap ("Read in Deutsch").

MC-23 (Won't, Release 1). Two-way chat, wearable or sleep data, and any message from the coach to a third party.

## 6. Data dictionary

Insight (one per run):

| Field | Type | Source | Notes |
|---|---|---|---|
| id, date | string, date | platform | player's local date |
| lang | ISO 639-1 | Preferences | first patron language |
| provenance | {notes, checkins, rankingDelta, nextEvent, daysToEvent} | agent | "From four notes, two check-ins…" |
| body | array of 1..3 strings | agent | 40 to 90 words; one sentence on light mornings |
| focus | string | agent | one imperative sentence |
| focusDone, focusDoneAt | boolean, datetime | player | |
| memory | {noteId, quote, date, context} or null | agent | |
| patternFlag | patternId or null | agent | new or strengthened |
| feedback | enum yes, notToday, none | player | |
| delivery | enum delivered, quiet, paused, withheld, failed, distress | platform | |
| toneCheck, cost | {passed, flaggedTerms}, money | platform | audit |

Pattern (shared entity, owned here; PRD-08 supplies physical candidates):

| Field | Type | Notes |
|---|---|---|
| id | string | |
| t, s | string | statement and explanation; unit text passes through `convT` (PRD-08) |
| kind | enum mental, physical | physical carries the Conditions badge |
| tag | string | Second serve, Travel, Habit, Conditions |
| ev | array of {noteId, hit} | evidence dots; hits ≥ 3 to exist |
| conf | enum Emerging, Strong | section 7 |
| off, offAt | boolean, datetime | dismissed |
| recurSince | integer | supporting notes since dismissal; re-raise at 2 |
| coachShare | boolean | mirrors the boundary switch |

Check-in: id, date, value 1..5, sentence, source. Boundaries: quietMatchMornings, coachSeesPatterns (both default true), pausedUntil. Distress evaluation: runId, fired, signals, resources shown.

## 7. Business rules and formulas

Mood scale. Note moods map to the check-in scale as Frustrated 1, Flat 2, Confident 4, Energised 5 (`MV` in the prototype); check-ins are stored as given. Row 3 has no note label and is reached only by check-ins.

Pattern thresholds. A candidate statement becomes a pattern when hits ≥ 3 among candidate notes in the last 90 days. Confidence is Strong when hits ÷ candidates ≥ 0.6, otherwise Emerging. In the prototype: the tiebreak pattern 3 of 4 (Strong); "The day after travel, you're flat" 5 of 6 (Strong); "You skip writing after wins" 4 of 6, Emerging because absence patterns are capped at Emerging until eight candidates exist (placeholder rule).

Dismissal. off = true removes the pattern from insights and the coach link. Each later note that would have been a hit increments recurSince; at 2 the pattern is re-raised with fresh evidence and the insight says so ("This came up again twice since you dismissed it.").

Physical patterns. PRD-08 emits a candidate when a performance figure in notes (first-serve percentage, second-serve faults) differs across stamps by a threshold PRD-08 defines; the Mindset Coach owns wording, badge and sharing. Unit-bearing text ("a one-kilo test") follows the units preference (M-CUR-2).

Light mornings. If yesterday's notes include a Travel context, or today's first check-in is ≤ 2, or a note was logged after 23:00 local, the insight is one sentence, the focus is rest or routine, and no new pattern is flagged.

Quiet mornings. If an Entered event has a match today and quietMatchMornings is true, delivery = quiet; the insight is delivered after the day's first Match note is saved, or not at all.

Feedback adaptation. Three notToday in a rolling seven days switches the prompt to a shorter, observation-only form for seven days (no focus unless a pattern flag exists) and logs the switch.

Distress rule (M-PRIV-3). Fires when a note or check-in sentence matches the distress lexicon (self-harm, hopelessness, not wanting to continue, in every supported language, under clinical review), or three consecutive check-ins are 1, or five of the last seven notes are Frustrated or Flat with a Sleep tag on at least three. When fired, delivery = distress, the card is shown, no insight or pattern is delivered, nothing reaches the coach link, and the run logs the signals. Non-lexicon thresholds are placeholders (section 12).

Language and tone. body and focus must pass language identification against the first patron language; a blocklist of clinical terms in the supported languages ("depression", "anxiety disorder", "burnout" as a label, "symptom", "diagnosis") fails the tone check. The coach describes behaviour in the player's words ("you write about rushing"), never in categories.

Memory quote. Cosine similarity between today's insight topic and embeddings of notes older than 60 days; shown when the top score ≥ 0.82 (placeholder), with date, event and result.

## 8. Acceptance criteria

MC-AC-1. Given four notes and two check-ins in the last 30 days, a ranking up 14 places and Poznań in 16 days, when the 06:00 run completes on 12 September, then the today card shows "From four notes, two check-ins, a ranking up 14 places, and Poznań in sixteen days.", a two-paragraph insight and one focus sentence.

MC-AC-2. Given Arya's first patron language is English and the app language is Chinese, when the insight renders, then insight and focus are in English, quoted note fragments keep their spoken language, and the chrome is Chinese.

MC-AC-3. Given three of Arya's last four notes after a tiebreak loss mention rushing the second serve, when detection runs, then "After a tiebreak loss, you write about rushing the second serve" exists with confidence Strong and "3 of 4 notes", and the today card carries a "Pattern flag" badge.

MC-AC-4. Given PRD-08 has emitted the first-serve candidate from the Anning stamps (48 percent at 33°C and 82 percent humidity against 62 percent at 24°C in Genoa), when the patterns card renders, then it appears first with the "Conditions" badge and "See the tension test", names 33°C and 82% humidity, and under Imperial units "a one-kilo test" reads "a two-pound test".

MC-AC-5. Given Arya taps "Not a pattern" on "You skip writing after wins", then the toast reads "Okay. Dismissed, and the coach heard you.", the pattern reads "Dismissed. The coach won't bring this up again unless it happens twice more.", it leaves `#/coach` within one minute, and the button reads Undo.

MC-AC-6. Given that pattern is dismissed, when two later wins are logged without a note, then it is re-raised with fresh evidence and the next insight says so; given only one such win, then it stays dismissed.

MC-AC-7. Given Arya taps the focus row, then the badge reads "Done · 4 of the last 5", the toast reads "Nice. Logged for tomorrow's insight.", and Recent mornings shows the day as Done the next morning.

MC-AC-8. Given "Quiet on match mornings" is on and Arya plays Genoa Q2 on 11 September, when 06:00 passes, then no notification is sent, the card reads "Match day. The coach is quiet until your evening note.", and Recent mornings later shows "Match day, stayed quiet".

MC-AC-9. Given Arya's 7 September Travel note ("Four hours in Vienna airport…") and a check-in of 2 on 8 September, when that morning's insight is produced, then it is one sentence, the focus concerns rest, and no pattern flag is raised.

MC-AC-10. Given a check-in sentence matches the distress lexicon, when the next run evaluates, then the someone-to-call card replaces the insight listing "Gerhard B. · +43 664 …", the ATP Player Assistance line and the local crisis line as tap-to-call actions, with no dismiss control, nothing on the coach link, and no setting that turns it off.

MC-AC-11. Given a generated insight contains the word "depression", when the tone check runs, then it is regenerated once, and if the second attempt fails the card reads "Nothing from the coach this morning. Your notes are still being read." and the audit log records it.

MC-AC-12. Given the 30-day range, when the chart renders, then the 11 September note is a solid dot on the Confident row with an "L" beneath it, the 12 September check-in is a hollow dot at 4, Genoa is shaded, and the callout "tiebreak loss · 'rushing' · 3 of 4" shows.

MC-AC-13. Given Marko opens the coach link, then the four statements, confidence badges and evidence counts are visible and no check-in, mood date or transcript appears; given Arya turns off "Coach sees patterns, not notes", then the card is absent within one minute.

MC-AC-14. Given a Free player with five notes, when they open `#/agent/mindset`, then the today card and check-in are live and the chart, patterns, boundaries and recent mornings are dimmed with one "Start Pro trial" action.

## 9. Notifications produced

FYI: "This morning's insight is ready" with body the insight's first sentence ("Three of your last four notes after a tiebreak loss mention rushing the second serve.") and action Read, at the configured time, respecting quiet hours and the match-morning and pause boundaries. FYI: "This morning's run didn't complete" after retries. FYI: "The coach is back" when a pause ends. On a distress morning the standard notification body reads "Something for you this morning" so a lock screen never shows the reason. No For-you notifications.

## 10. Sharing scope

Coach: pattern statements, kind, confidence and evidence counts while the boundary is on, stamp values included on the physical pattern. Never insights, check-ins, moods by date, transcripts or the distress state. Manager and public profile: nothing. Export (M-PRIV-2): insights, check-ins, patterns with evidence ids, feedback, boundaries and distress evaluations.

## 11. Analytics events

insight_generated (lang, sentences, hasMemory, patternFlag, delivery), insight_viewed, insight_feedback (yes or notToday), focus_done, checkin_saved (value, source), pattern_created (kind, conf), pattern_strengthened, pattern_dismissed, pattern_restored, pattern_reraised, pattern_notes_opened, tension_test_opened, boundary_changed, pause_started, pause_ended, distress_card_shown (signals), distress_resource_tapped, tone_check_failed, run_failed. Product KPIs: insight read rate (60 percent), focus completion (50 percent), pattern dismiss rate (below 25 percent), check-in days per week, tone-check failure rate (below 1 percent), distress card precision reviewed monthly with a clinician.

## 12. Out of scope and open questions

Out of scope for Release 1: chat with the coach, sleep or wearable inputs, a coach-to-player message channel, team views, insights about opponents, content addressed to patrons.

Open questions: the Strong threshold (ratio ≥ 0.6) and the Emerging cap for absence patterns are placeholders; the distress rule's non-lexicon signals and the memory similarity threshold of 0.82 are placeholders for clinical and player review; the distress lexicon needs review per language and each launch country's crisis line needs sourcing (PRD-00 section 10); whether under-18 players should see youth lines; the label for the chart's middle row; whether "Good day to write" nudges live here or in Match Scribe.

Resolved 13 September 2026 (worksheet 17): the mood chart offers 30 and 90 days, matching the 90-day pattern window in section 7; the brief's 12-week figure is superseded. Notes carry four moods while the check-in has five states; section 7 reconciles them and the middle state has no word. Onboarding says the coach starts after the third note while Settings > Agents lets it be switched on at any time; this document requires three notes regardless.
