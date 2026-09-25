# PRD-02 · Match Scribe

Version 0.1 · 12 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/match-scribe` (recorder card, review, pipeline card, daily check-in, past notes), the FAB `#fab` and tab bar `#tabRec` on every route, the quick-actions sheet `#qa`, the Recent matches card on `#/coach`, and the Preferences pane on `#/settings` ("Language you speak in Match Scribe"). The prototype's retention copy ("Audio kept 90 days") is superseded by M-PRIV-1 (section 12).

---

## 1. Purpose and job to be done

Everything else in DeuceX is built on what the player says in the minute after a match, a practice or a long day of travel. The Tournament Agent reads results and surface form from it, the Content Agent turns it into a patron update, the Mindset Coach looks for patterns across it, and the Conditions layer attaches the weather and the ball so that a physical pattern can be told apart from a mental one. Match Scribe is the capture surface for that minute: fast enough to use in a car park with a bag on one shoulder, forgiving enough that the player never types, and honest about what happens to the recording afterwards.

The prototype's page description is the promise: "Sixty seconds after a match, a practice or a long day. Talk like you would to a coach in the car. Every agent reads this." Job statement: "Within a minute of walking off court, let me say what happened and how it felt, in whatever language comes out, and turn it into something my agents and my coach can use without me ever typing a result or a mood."

Success: a note is started within two taps from any screen; the transcript is on screen within 20 seconds of stopping (PRD-00 section 6); at least 70 percent of notes are saved without edits to the extracted result, opponent or mood; and the player keeps writing after wins as well as losses.

## 2. Users and entitlements

Player on Pro or Elite: unlimited notes, all contexts, coach summary sharing, condition stamps. Player on Free: 10 notes a calendar month and no coach share (PRD-00 section 4); the eleventh attempt shows the locked state on the recorder card with "You've used 10 of 10 notes this month" and a Start Pro trial action, past notes remain readable and searchable, and the "Visible in the coach link" switch is absent. Coach via share link: results and the agent's one-line summary of each match note, never the transcript or the audio (M-SHARE-1); `#/coach` says so in its own copy, "Transcripts stay private." Manager via share link: nothing from Match Scribe (M-SHARE-2). Patrons and sponsors: nothing directly; the Content Agent decides what reaches them, with the player's approval. Players under 18 (M-ID-3) have the same recorder; the guardian's manager link excludes notes.

## 3. Agent contract

Trigger. The player taps a record control (the recorder button on `#/match-scribe`, the FAB, the Scribe tab). There is no scheduled run; Match Scribe only works when the player speaks. Downstream runs (Content Agent within 30 minutes, overnight analysis at 02:00 UTC, Mindset Coach at 06:00 local) are triggered by a saved note and specified in their own documents.

Inputs. The audio (capped at 60 seconds), the chosen context, the spoken-language preference (Auto-detect via Whisper, or a fixed language from English, 中文, Español, Deutsch), the player's tag vocabulary, the current Entered event, and the venue forecast and fact sheet from PRD-08 when the context is Match and the stamp switch is on.

Outputs. A transcript in the language spoken; a structured extraction validated against a schema (context, result, opponent, tags, mood, and a one-line summary for the coach); a Conditions stamp when applicable; a saved Note that other agents may consume; one FYI notification "Note transcribed · 0:52" whose body names the match and, once the Content Agent has followed, the interval ("Content draft followed 26 minutes later").

Approval gate. Nothing in a note leaves the app on its own. The transcript is editable before saving; mood, result, opponent and tags are proposals ("The agent guessed from your words. Correct it if it's wrong."). Saving is the approval that lets agents consume the note; the coach summary is shared only while the per-note switch is on; the Content Agent's draft is gated in PRD-05. Deleting requires the inline confirmation "Delete this note and its audio? Agents lose it too."

Failure behaviour. If transcription fails or exceeds 20 seconds the note stays in review with the audio playable, an empty editable transcript, the badge "Transcription didn't finish" and Retry; the player can type the note instead. If extraction fails validation the transcript is saved with the chosen context only and the review reads "We couldn't read a result from this. Fill it in if you want the agents to have it." Offline capture queues locally with a visible "Waiting for signal · 1 note" state (M-PLAT-2). If the stamp cannot be fetched the note saves without one and PRD-08 backfills it within 24 hours.

Audit. Each note records upload time, transcription model and version, detected language and confidence, extraction model, prompt and schema versions, validation result, the player's edits to each proposed field, the coach-share flag at save time, and cost. Audio deletion is logged with its cause. Visible under Settings > Data & safety (M-GATE-4).

Cost. Target under A$0.05 per note for transcription and extraction combined; the coach summary comes from the same extraction call. A retry after failure is a new run.

## 4. Surfaces and states

### 4.1 Recorder card (`#/match-scribe`, `#recCard`)

Header "New note" with the description "Pick what this is about, then tap to record. Stop whenever you're done." and a state badge `#recState`. Context group `#ctxGroup` with Match (default), Practice, Travel and Other. The stage: the record button `#recBtn`, the waveform `#wave`, a progress bar and the hint line with the timer "0:00 / 1:00".

States, from `setRec()` in the prototype: Idle (badge "Ready", hint "Tap to record"); Recording (badge "Recording" in the danger colour, hint "Listening… tap to stop", description "Say what happened and how it felt. The agents do the rest.", FAB and Scribe tab pulsing, automatic stop at 1:00); Processing (badge "Transcribing", button disabled, spinner "Transcribing with Whisper…"); Review (badge "Review" in lime, description "Fix anything Whisper misheard. Mood and tags help the Mindset Coach spot patterns."). Added here: Failed ("Transcription didn't finish", Retry and Type instead); Locked on Free at 10 of 10; Offline queued ("Waiting for signal" with the queued count).

### 4.2 Review (`#review`, `#recFoot`)

Transcript textarea labelled "Transcript · Whisper · edit anything it misheard". Mood group `#moodGroup` (Frustrated, Flat, Confident, Energised) with the proposal pre-selected and the line "The agent guessed from your words. Correct it if it's wrong." Match fields, shown only for the Match context: Result ("L 6-4 3-6 6-7(5)") and Opponent ("vs D. Kovalenko · Q2 · clay"). Tags as multi-select pills. "Conditions · attached automatically" with the stamp chips 24°C, 58% RH, outdoor clay, Dunlop Fort, Genoa. Coach switch `#coachSw` "Visible in the coach link". Footer: Save note, Record again, Discard ("Note discarded").

### 4.3 Pipeline card (`#steps`)

"What happens to your note", description "Latest: Thu 11 Sep, 18:42 · Match vs Kovalenko". Five steps with badges: Uploaded (Cloudflare R2 · player-scoped), Transcribed (Whisper · 7s), Overnight analysis (GPT-4o · 02:00 UTC · mood: confident · brief sent), Mindset Coach insight (Delivered 06:00 · pattern flag: second serve), Content Agent draft ("Three set points, one lesson" · waiting for you · Approve). After a save the badges read Done, Now, Tonight, Tomorrow, Soon.

### 4.4 Daily check-in (`#dailyMood`)

"Thirty seconds when there's nothing to record. Feeds the Mindset Coach's pattern detection." A 1 to 5 radio group labelled "Today · 1 flat, 5 energised", an optional sentence, Save check-in with the toast "Check-in saved · 4/5". The same control appears on the dashboard (`#moodRow`) and `#/agent/mindset` (`#mcMood`); PRD-06 specifies it.

### 4.5 Past notes (`#hist`)

"Last 30 days. Colour is the mood you tagged." with the count badge ("11 notes"), a 30-cell mood strip, a filter (All, Matches, Practice, Travel) and "Search transcripts". Each entry: date with a mood dot, context and result line with a flag, the transcript, a footer with mood, tag pills, "· Thu 18:42 · 0:52", "· Used by Mindset, Content draft", the stamp row when present (tooltip "Attached automatically from the venue forecast and the tournament fact sheet at match time."), and Play and Delete. Empty search state: "No notes match".

### 4.6 Capture from anywhere (`#fab`, `#tabRec`, `#qa`)

The FAB (desktop and tablet) and the Scribe tab (mobile) open the quick-actions sheet (Record a note, Scan a menu, Scan a receipt). Record a note navigates to `#/match-scribe` and starts recording on arrival (`goRecord()`); while recording, a tap on either control stops the recording.

### 4.7 Coach view (`#/coach`, Recent matches)

One row per match: W or L, score, opponent, event and round, surface, date, "0:52 note" and the one-line summary with "Mood tagged: confident". No transcript, audio or play control.

## 5. Functional requirements

S-1 (Must). A recording can be started from any route in at most two taps (FAB or Scribe tab, then Record a note), and from the recorder card in one.

S-2 (Must). Recording stops automatically at 60 seconds, shows elapsed time as "m:ss / 1:00", and can be stopped earlier by a second tap on the record control, the FAB or the Scribe tab.

S-3 (Must). The context (Match, Practice, Travel, Other) is chosen before recording and can be changed in review; result and opponent fields appear only when the context is Match.

S-4 (Must). Transcription uses Whisper or an equivalent with per-note language detection (M-LANG-2); the detected language is stored on the note and the transcript is never translated unless the player asks.

S-5 (Must). A fixed spoken language chosen in Preferences overrides detection for every note until changed; under Auto-detect, mixed-language notes are transcribed as spoken.

S-6 (Must). The transcript is editable before saving and edits are stored alongside the original transcription, never overwriting it.

S-7 (Must). Extraction produces context, result, opponent, tags, mood and a coach summary, validated against a versioned schema; a payload that fails validation is rejected and logged, and the note is saved with transcript and context only.

S-8 (Must). Extracted result, opponent, mood and tags are pre-filled proposals the player can change, and the review states that the agent guessed from the player's words.

S-9 (Must). Mood on a note is one of Frustrated, Flat, Confident or Energised, or empty when the player clears the proposal.

S-10 (Must). The extractor may propose only tags in the player's vocabulary (initial set Second serve, Tiebreak, Clay, Fitness, Travel, Sleep, Routine, First serve, Heat); new tags are added by the player.

S-11 (Must). When the context is Match, the stamp switch in Settings > Equipment is on, and PRD-08 has a forecast and fact sheet for the current Entered event, a Conditions stamp is attached at save time and shown as chips labelled "attached automatically".

S-12 (Must). Saving a note makes it available to other agents, inserts it at the top of Past notes with a Processing badge, shows the toast "Saved · Content draft within 30 min, Mindset insight at 06:00", and the entry then lists the agents that consumed it ("Used by Mindset, Content draft").

S-13 (Must). Audio is deleted when the note is saved with the transcript confirmed, or 7 days after upload, whichever is first (M-PRIV-1); transcript, extraction and stamp are retained until the player deletes the note.

S-14 (Must). Deleting a note requires the inline confirmation "Delete this note and its audio? Agents lose it too." and, on confirmation, removes note, audio and extraction and excludes the note from every agent's next run.

S-15 (Must). The coach share is per note, defaults to on for Pro and Elite, and shares only the result line and the coach summary; transcripts and audio are never in any share scope.

S-16 (Must). Free players can save 10 notes per calendar month; the recorder shows the count used and the locked state at the limit, and past notes stay readable and searchable.

S-17 (Must). Past notes filter by context and search across transcript, result and tags, with the empty state "No notes match".

S-18 (Must). A note captured without connectivity is queued on the device with a visible queue state and uploaded when connectivity returns; the 7-day audio clock starts at upload.

S-19 (Must). The pipeline card reflects the real status of each downstream step for the latest note, and transcription failure and extraction failure are distinct states with Retry that never lose the audio or typed text.

S-20 (Should). After a win with no note by 22:00 local, one FYI notification "Good day to write" is offered at most once a week, in support of the "You skip writing after wins" pattern.

S-21 (Could). A note can be recorded for a past day by choosing the date in review.

S-22 (Won't, Release 1). Typed-only notes as a primary path, video capture, and automatic result import from the ITF or ATP feeds.

## 6. Data dictionary

Note (owned by Match Scribe; consumed by Mindset Coach, Content Agent, Tournament Agent, Conditions):

| Field | Type | Source | Notes |
|---|---|---|---|
| id | string | platform | stable |
| recordedAt | datetime with zone | device | shown as "Thu 18:42" |
| dur | seconds 0..60 | recorder | shown as "0:52" |
| ctx | enum Match, Practice, Travel, Other | player | editable in review |
| audioRef | string or null | storage | player-scoped; null after deletion |
| audioDeletedAt, audioDeleteCause | datetime, enum confirmed, expired, playerDelete, accountDelete | platform | M-PRIV-1 |
| lang, langConf | ISO 639-1, decimal | Whisper | or source "preference" when fixed |
| transcriptRaw, transcript | text | Whisper, player | raw never overwritten |
| res | string or null | extractor, player | "L 6-4 3-6 6-7(5) · Kovalenko" |
| opp, round, surface | string or null | extractor, player | "D. Kovalenko", "Q2", "clay" |
| tags | array of string | extractor, player | from the player's vocabulary |
| mood | enum Frustrated, Flat, Confident, Energised, or null | extractor, player | maps to 1, 2, 4, 5 on the check-in scale (PRD-06) |
| summary | string ≤ 220 chars | extractor | the coach line |
| coachShare | boolean | player | default true on Pro and Elite; false on Free |
| cond | array of string or null | PRD-08 | ['24°C','58% RH','outdoor clay','Dunlop Fort','Genoa'] |
| used | array of enum Mindset, Content, Tournament, Conditions | platform | appended on consumption |
| status | enum queued, uploaded, transcribing, review, saved, failedTranscription, failedExtraction, deleted | platform | drives badges |
| edits | array of {field, proposed, saved} | platform | audit of corrections |
| extraction | {model, promptVersion, schemaVersion, valid, cost} | platform | per run |

Check-in (owned here, read by PRD-06): id, date, value 1..5, sentence, source (scribe, dashboard, mindset). Monthly quota (Free): playerId, month, used, limit 10.

## 7. Business rules and formulas

Recording cap: 60 seconds, enforced on the device; the progress bar is elapsed ÷ 60. Notes are never trimmed after the fact.

Language: under Auto-detect the note's language is Whisper's detection with its confidence; a fixed preference forces that language and the note records source "preference". App language (M-LANG-1) never changes the transcript.

Extraction schema (Zod-style, version 1): ctx as the four-value enum; res as a string matching the result grammar or null; opp as string or null; round from Q1, Q2, Q3, R1, R2, R3, QF, SF, F or null; tags as an array of strings each in the player's vocabulary; mood as the four-value enum or null; summary as a string of at most 220 characters. A response that fails validation is retried once with the errors appended to the prompt; a second failure is a failed extraction.

Mood proposal: made only when the extractor's self-reported confidence is at least 0.6 (placeholder, section 12); otherwise the mood group has no selection and the review reads "Tag the mood if you want the coach to have it."

Result grammar: W or L, then sets as d-d with an optional tiebreak in parentheses, for example "L 6-4 3-6 6-7(5)".

Stamp attachment: ctx is Match, the Equipment stamp switch is on, and PRD-08 has a forecast and fact sheet for an Entered event whose dates include the recording date. Chips in order: temperature, humidity, indoor or outdoor plus surface, ball, place; the first two turn amber at 28°C and 70 percent (PRD-08 section 7). Practice and Travel notes carry a stamp only when the player adds one.

Audio retention: deletedAt = min(saved with confirmed transcript, uploadedAt + 7 days). A note saved with an untouched transcript counts as confirmed. Queued offline notes start the clock at upload.

Free quota: saved notes in the player's local calendar month; discarded and failed notes do not count; the counter resets at 00:00 local on the first. Downgrade keeps all notes readable (M-TIER-2).

Coach visibility: the summary appears on `#/coach` when coachShare is true, the tier includes coach links, and the link is not revoked (M-SHARE-3).

Agent consumption: the Content Agent may consume a note within 30 minutes of save; the overnight analysis at 02:00 UTC and the Mindset Coach at 06:00 local read notes saved since their previous run. A deleted note is excluded from any run that starts after the deletion.

## 8. Acceptance criteria

S-AC-1. Given Arya is on `#/` at 390px wide, when she taps the Scribe tab and then Record a note, then the app is on `#/match-scribe`, the badge reads "Recording", the timer shows "0:00 / 1:00" and the tab is pulsing.

S-AC-2. Given a recording is at 0:59, when one more second elapses, then recording stops on its own, the badge reads "Transcribing" and the record button is disabled.

S-AC-3. Given a 52-second Match note spoken in German with English tennis words, when transcription completes, then the transcript is German with the English words as spoken, lang is "de", and the chrome stays in the app language.

S-AC-4. Given the transcript "Lost to Kovalenko in a third-set breaker, six-four, three-six, six-seven…", when extraction completes, then the review pre-fills Result "L 6-4 3-6 6-7(5)", Opponent "vs D. Kovalenko · Q2 · clay", mood Confident, and tags Second serve, Tiebreak and Clay.

S-AC-5. Given the stamp switch is on and Genoa Q2 is Arya's Entered event on 11 Sep, when the review renders, then the Conditions field shows 24°C, 58% RH, outdoor clay, Dunlop Fort, Genoa with no amber chip; given the 14 Aug Anning note with ['33°C','82% RH','outdoor hard','Head Tour'], then 33°C and 82% RH are amber and the other two are not.

S-AC-6. Given Arya taps Save note on the Kovalenko note, when the save completes, then the toast reads "Saved · Content draft within 30 min, Mindset insight at 06:00", the entry appears first with a Processing badge, the count reads "12 notes", and the pipeline card shows Transcribing Now.

S-AC-7. Given a saved note whose transcript Arya did not edit, when the save completes, then the audio is deleted within one minute and the Play control is hidden, while the transcript remains.

S-AC-8. Given a note uploaded 5 Sep 19:15 and never opened again, when 12 Sep 19:15 passes, then the audio is deleted with cause "expired" and the audit records it.

S-AC-9. Given Arya taps Delete on the 25 Aug "Return drills" note, when the confirmation shows, then it reads "Delete this note and its audio? Agents lose it too." and nothing is removed until Delete is tapped; on Delete the count falls from 11 to 10 and the toast reads "Note deleted".

S-AC-10. Given Marko opens the coach link, when Recent matches renders, then the Kovalenko row shows "L", "6-4 3-6 6-7(5) · D. Kovalenko · Genoa Q2 · clay", "0:52 note", the summary and "Mood tagged: confident", and no transcript or play control appears anywhere on the page.

S-AC-11. Given a Free player has saved 10 notes in September, when they open the recorder on 20 Sep, then the card is dimmed with "You've used 10 of 10 notes this month" and one Start Pro trial action, and Past notes still filters and searches.

S-AC-12. Given the phone has no signal after a match, when the player records and saves, then the entry shows "Waiting for signal · 1 note", and when signal returns the note uploads and transcribes without a further tap.

S-AC-13. Given the extractor returns mood "Angry", when validation runs, then the payload is rejected and retried once, and on a second failure the note is saved with transcript and context only and the review reads "We couldn't read a result from this. Fill it in if you want the agents to have it."

S-AC-14. Given the search field contains "breaker", when Past notes filters, then only the 11 Sep and 5 Sep notes remain, and clearing the field restores all 11.

## 9. Notifications produced

FYI: "Note transcribed · 0:52" with body "Match vs Kovalenko. Content draft followed 26 minutes later." and action Open, one per saved note, folded into the weekly digest under M-NOTIF-3. FYI: "Transcription didn't finish" with Retry. FYI: "Note uploaded" when a queued offline note completes while the player is elsewhere. Should: "Good day to write" after a win with no note (S-20), at most weekly. Match Scribe never produces a For-you notification; nothing about a note needs a decision.

## 10. Sharing scope

Coach: result line, event and round, surface, date, note duration, the coach summary and the tagged mood per match note while the note's share switch is on; patterns built from notes are shared by PRD-06. Never the transcript, the audio, practice or travel notes, or moods by date. Manager: nothing. Public profile: nothing directly; the Content Agent may quote a note only inside a draft the player approves. Export (M-PRIV-2): transcripts, extractions, stamps and edit history as JSON and CSV, plus audio within retention.

## 11. Analytics events

note_started (entry fab, tab, page; ctx), note_stopped (dur, autoStopped), note_transcribed (latencyMs, lang, langConf), note_extracted (valid, retried), note_edited (field), note_saved (ctx, mood, tagCount, hasStamp, coachShare, dur), note_discarded, note_deleted, note_playback, note_search, hist_filter_changed, quota_reached, note_queued_offline, note_uploaded_from_queue, checkin_saved (value, source). Product KPIs: notes per active player per week (target 3 or more), share of matches with a note (target 80 percent), share of wins with a note, transcription p90 latency (under 20 seconds), extraction acceptance rate (target 70 percent saved without edits), audio deleted within retention (100 percent).

## 12. Out of scope and open questions

Out of scope for Release 1: typed notes as a first-class path, video, automatic result import from official draws, opponent profiles, doubles partner notes, on-demand translation of transcripts, a stringer or physio share scope.

Open questions: the mood-proposal confidence threshold of 0.6 is a placeholder for review with real transcripts; whether the 60-second cap should stretch to 90 seconds for Travel notes; whether the Free quota should count discarded notes that reached transcription (cost is incurred) or only saved notes; whether the coach summary should be shown to the player in review; whether "Good day to write" belongs here or in the Mindset Coach.

Inconsistencies between the prototype and PRD-00: the Match Scribe header badge, help tip and Connections pane say audio is "kept 90 days" with a "Delete all audio now" action, while M-PRIV-1 deletes audio on confirmation or after 7 days; this document follows PRD-00. The prototype promises transcription "usually under 10 seconds" while PRD-00 section 6 requires under 20; the copy should not promise 10. The coach view shows match durations ("2h 41m") that no Match Scribe field captures; either the extractor proposes a duration or the coach row drops it.
