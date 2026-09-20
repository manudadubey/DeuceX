# PRD-05 · Content Agent

Version 0.2 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/agent/content` (editor `#caEditor`, recipients `#recips`, send time `#caWhen`, teaser switch `#teaserSw`, the checks with `#vcCoach` and `#fixCoach`, the history `#caHist` built from `CH`), the Content Agent card on `#/`, the "Draft ready" notification, the Content Agent row in Settings > Agents, "Patron updates written in" in Preferences (`#prefPatron`), the teaser toggle on `#/profile`, the Match Scribe pipeline step, and "Post an update" on `#/fans`. Patrons, tiers, payouts and the per-patron notes drafted for Fans are PRD-04; the public page is PRD-11.

---

## 1. Purpose and job to be done

Arya's twelve patrons pay for a season that mostly happens in qualifying rounds nobody streams, and the only thing they reliably receive in return is what she writes to them. She writes least when it matters most: the Mindset Coach already sees that "four of the last six wins have no note" and that "the good weeks are the ones the Content Agent has least to work with". The Content Agent closes that gap. Within a set window of every Match Scribe note or result it drafts a patron update in her voice, checks it against what she has kept private before, proposes who should receive it and when, and then waits. The page header puts it plainly: "Drafts a patron update within thirty minutes of every Match Scribe note, in your voice. Nothing goes out until you approve it."

The agent is also the product's honesty mechanism. The reference draft opens "I lost 6-4 3-6 6-7(5) to Kovalenko yesterday and I'm oddly fine with it" and immediately corrects itself: "Not because losing is fine. It isn't, and a Q2 loss in Genoa is a week of costs for a first-round cheque." Patrons stay because the updates tell them the real week: the Fans loop card records "Clay block, week two" opened by 71 percent with two joins inside seven days. The agent exists to make that loop happen every week without the player pretending.

Job statement: "After every match I record a note; turn it into the update I would write to my patrons if I had the hour, in my words and in each language I publish in, tell me who should get it and when, warn me if I have said something I usually keep private, and send it only when I tap."

Success: at least 70 percent of notes with a result lead to a published update within 48 hours; draft approval rate stays above 50 percent; median open rate stays above 65 percent as measured by Resend; no published update names a coach, money or an injury without a recorded override.

## 2. Users and entitlements

Player on Pro or Elite: full agent (PRD-00 section 4). Player on Free: no Content Agent; `#/agent/content` renders the locked state with the sample draft dimmed, one explanation line and one "Start Pro trial" action (M-TIER-1). Patron: receives the version for their tier by email through Resend, in their chosen language where the player publishes more than one. Free follower: the teaser paragraph on the public profile when the player allowed it. Coach via share link: nothing (M-SHARE-1); the agent additionally checks that the coach is not named (C-10). Manager via share link: nothing (M-SHARE-2 excludes agent drafts). Downgrade (M-TIER-2): published updates and history remain readable, open drafts cannot be published, and the teaser stays until the player removes it.

## 3. Agent contract

Trigger. When a Match Scribe note is confirmed, or a result is recorded without a note, after the window chosen on the Content Agent row in Settings > Agents: "Within 30 minutes" (default), "Next morning 06:30", or "Only when I ask". Also on demand from New update ("Blank draft · the agent will suggest an angle from your last three notes") and from "Post an update" on `#/fans`. Runs requested by the Fans attention pass produce per-patron notes governed by PRD-04. Only one update draft is open at a time; a new trigger offers "Rebuild from the new note".

Inputs. The triggering note (transcript, language, context, result, opponent, tags, mood, conditions stamp) and the two before it; the voice profile (the profile bio plus the three best-opened past updates, summarised in the Voice profile control as "3 example updates, tone: direct, dry, no exclamation marks"); the update history with open rates; tiers and active patron counts; the language set in "Patron updates written in"; the next tournament deadline; the private-topics list (section 7).

Outputs. One draft in the player's patron-update language (Release 1; several languages in Release 2 per M-LANG-3), with subject, two alternative subjects, body, word count and reading time, a recipient proposal by tier with a one-line reason each, a send time, a teaser decision, a "Built from" list and four "Before it goes out" checks. One For-you notification per run: "Draft ready: "Three set points, one lesson"", body "197 words from last night's note. Courtside + Locker Room. Nothing goes out until you approve." Nothing is sent, scheduled or posted.

Approval gate. Approve & publish is two-step. The first tap shows the confirm block, "Send to 11 patrons now?" or "Schedule for 11 patrons · 07:00 your time?", with "Emails can't be unsent. The teaser goes on your public profile too" (or "stays off your profile"), and Send or Schedule plus Back (M-GATE-1, M-GATE-2). In Release 2, each language version is approved separately (M-LANG-3). Scheduled sends can be cancelled until the send time; sent emails cannot be recalled; the teaser can be removed at any time (M-GATE-3). Skip records a reason and sends nothing.

Failure behaviour. If drafting fails, the editor opens empty with the subject "Write it yourself" and the line "The agent couldn't draft this one. Your note and result are attached below." If Resend rejects a send, the status becomes "Send failed" with "Nothing reached patrons. Try again or download the text." If one language version fails, the others remain approvable.

Audit. Each run records trigger, note id, inputs hash, model and prompt version, drafts, check results and cost; each approval records player, timestamp, device, text as sent per language, recipients as patron ids, send time and teaser flag; each skip records the reason (M-GATE-4).

Cost. Target under A$0.08 per run for the primary language including checks, under A$0.05 per additional language and under A$0.03 per rewrite; nothing is generated speculatively.

## 4. Surfaces and states

### 4.1 Content Agent page (`#/agent/content`)

Header: the description quoted in section 1, Voice profile and New update.

Editor card `#caEditor`: title "Draft · from last night's note"; provenance "Claude Sonnet · drafted 06:12, 26 minutes after your Match Scribe upload. Edit anything."; status badge `#caStatus` "Awaiting approval". Subject `#caSubj` "Three set points, one lesson" with alternatives "The best twenty minutes since Bratislava" and "Down 2-5 in the third". Rewrite tools Shorter, Warmer, More tactical and Restore original (variants of 99, 172 and 159 words against the 197-word original). Body `#caBody` with `#caCount` "197 words · about 1 minute to read" and "Autosaved · edits stay if you leave". "Built from · what the agent read before writing" pills: "Match Scribe · Thu 18:42 · 0:52" linking to `#/match-scribe`, "Result · L 6-4 3-6 6-7(5) vs Kovalenko", two Voice pills with open rates (83% and 64%), "Mood · confident". Footer `#caFoot`: Approve & publish `#caApprove`, Preview email, Skip this draft `#caSkip`.

Who receives it: `#caRecipD` "11 patrons · Inside Track gets it a day early with your call notes."; checkbox rows Courtside "Every update · 8 people" (checked), Locker Room "Adds the practice notes section · 3 people" (checked), Inside Track "Already had the call · skip to avoid repeating yourself" (unchecked). When `#caWhen`: "Send now", "Tomorrow · 07:00 your time", "Thursday · before the Poznań deadline". Teaser switch `#teaserSw` "Post the first paragraph on your public profile", on by default.

Before it goes out ("The agent's own read of the draft."): "Sounds like you · Closest to your two best-opened updates · short sentences, no exclamation marks"; "Nothing about money or injuries · Runway and the physio visit stay private"; "Names your coach · You've kept coaches unnamed in every past update. "Marko" appears once." with Fix `#fixCoach`; "Opponent named respectfully · Result stated, no commentary on his game".

Confirm state: the footer becomes the confirm block of section 3. Published: footer "Sent to 11 patrons via Resend" with "Watch it land in Fans", toast "Published to 11 patrons". Scheduled: footer "Scheduled · <when>" with Cancel. Skipped: title "Skipped · the agent will try again after your next note", footer "Skipped. Nothing was sent." with Undo.

Past updates ("Open rates from Resend. Joins are new patrons within seven days of sending."): filter All, Published, Skipped; one row per `CH` entry with title, status, date, tiers, word count, note (for example "You skipped it: "nothing to say yet""), opened and joins in 7d. Missing values show a neutral placeholder, never a number.

Other states: loading; no draft; drafting; multi-language (one tab per language, each with its own status); draft failed and send failed; Free locked; downgrade read-only.

### 4.2 Today row card (`#/`)

"Content Agent · Drafted 06:12 from last night's note", badge "Approve" (tooltip "nothing is sent to patrons until you approve it here or on the Content page"), the subject, the first paragraph truncated, chips "197 words" and "Courtside + Locker Room", actions Approve & publish and Edit, with the consequence sentence printed on the card itself: "Sends to 11 patrons now, from your address. It cannot be recalled once sent." On the dashboard card the approval is one tap because the sentence is visible in the same glance (decided 13 September 2026, worksheet 8); the agent page keeps its two-step block.

### 4.3 Notification rail, Settings, Match Scribe, Profile and Fans

Notification: For you, 06:12, "Draft ready: "Three set points, one lesson"" with action Approve. Settings > Agents row with the three window options, Run now and Pause. Preferences "Patron updates written in" (English, 中文, Español, Deutsch; single-select, English pressed) with "One language per update for now; the Content Agent drafts in it and the Mindset Coach speaks to you in it." Match Scribe pipeline step "Content Agent draft · waiting for you · Approve". Profile toggle "Latest update teaser". Fans header action "Post an update".

## 5. Functional requirements

C-1 (Must). The agent produces a draft within the window chosen in Settings > Agents after every confirmed Match Scribe note that carries a result and after every result recorded without a note; the default window is 30 minutes.

C-2 (Must). Every draft is in the first person, in the voice defined by the voice profile, with no exclamation marks unless the past updates use them.

C-3 (Must). A draft states the result and score first, never describes a loss as acceptable except through the player's own reasoning from the note, and invents nothing absent from the note and result.

C-4 (Should, Release 2). One version is drafted per language in "Patron updates written in", each under its own tab with its own subject, checks and status, and each approved, scheduled or skipped separately (M-LANG-3). Release 1 drafts in the single language chosen in Preferences (decided 13 September 2026, worksheet 9).

C-5 (Must). Shorter, Warmer and More tactical rewrite the body on request, preserving the player's own edits above the fold; Restore original returns the generated text.

C-6 (Must). The body is editable and autosaved, with a live word count and reading time (section 7); the subject offers two alternatives that swap on tap.

C-7 (Must). The "Built from" list names every input the agent read and links the note to `#/match-scribe`.

C-8 (Must). Recipients are proposed by tier with a reason each; toggling a tier updates the count line, and Approve is disabled when no tier is selected.

C-9 (Must). Tier content follows the PRD-04 perks: Locker Room and above receive the practice notes section, and Inside Track receives the update a day early with the call notes or is proposed as skipped when the player has spoken to them since the match.

C-10 (Must). The four checks (Sounds like you, Nothing about money or injuries, coach unnamed, opponent named respectfully) run on every draft and edit, show pass or warn with a reason, and a warn offers a one-tap Fix that edits the text and re-runs the check.

C-11 (Must). The money check warns on any figure or named private quantity (runway, reserves, burn, amounts) and the injury check on named injuries, treatments or practitioners; a warn never blocks publishing, and an override is recorded.

C-12 (Must). The send time offers Send now, Tomorrow 07:00 local, and the next tournament deadline day when one falls inside seven days; a scheduled update can be cancelled until its send time.

C-13 (Must). The teaser switch controls whether the first paragraph appears on the public profile as "Latest for patrons"; the confirm sentence states the effect; the teaser can be removed later without affecting the sent email.

C-14 (Must). Approve & publish is two-step on the Content Agent page, and one tap on the dashboard card only where the consequence sentence is printed on the card next to the control (M-GATE-2); and a send goes through Resend to the patrons active in the selected tiers at send time, one email per patron.

C-15 (Must). Skip requires a reason (quick options "nothing to say yet", "too soon", "I'll write it myself", or free text), sends nothing, records the reason on the history row, keeps the draft for Undo until the next trigger, and the agent does not redraft from the same note.

C-16 (Must). The history lists every draft with date, tiers, word count, status, Resend open rate and joins attributed within seven days (section 7), filterable by All, Published and Skipped.

C-17 (Must). Exactly one For-you notification is created per draft run and none for rewrites, edits or checks (M-NOTIF-1).

C-18 (Must). No scheduled or triggered run, including Run now in Settings and the Fans attention pass, sends, schedules or posts anything (M-GATE-1).

C-19 (Should). Preview email sends the current version to the player's own address, labelled "Preview", and never counts as a publish.

C-20 (Should). New update with no fresh note drafts from the last three notes.

C-21 (Could). The agent suggests a match-day photo from the camera roll for the player to attach.

C-22 (Won't, Release 1). Posts to third-party social platforms; the teaser goes only to the public profile.

## 6. Data dictionary

Patron update (one per triggering run, one version per language):

| Field | Type | Source | Notes |
|---|---|---|---|
| id | string | platform | stable across versions and rewrites |
| trigger | enum note, result, manual, fans-pass, rebuild | agent | |
| noteId, resultId | string | Match Scribe | primary sources |
| status | enum draft, scheduled, published, skipped, failed | player, Resend | per version |
| version.lang | ISO 639-1 | Preferences | en, zh, es, de offered in the prototype |
| version.subject, altSubjects[2] | string | agent, player | |
| version.body | text | agent, player | generated and edited text both kept |
| version.words, readMinutes | integer | computed | section 7 |
| version.checks[] | array of {kind, state, reason, fixApplied} | agent | |
| builtFrom[] | array of {kind, label, ref} | agent | |
| tiers[], recipientCount | array, integer | agent, player | count resolved at send time |
| sendAt, teaser | datetime, boolean | player | null sendAt means Send now |
| sentAt, resendBatchId | datetime, string | Resend | per version |
| delivered, opens, openRate | integer, integer, percent | Resend | unique opens |
| joins7d, upgrades7d | integer | Fans | section 7 |
| skipReason | string | player | quoted on the history row |
| cost | money | agent | per run and per rewrite |

Voice profile: bio, exampleUpdateIds[3], toneSummary, privateTopics[] (defaults runway, reserves, burn, injuries, physio, named coach). Run record: id, trigger, noteId, inputsHash, model, promptVersion, output validated against the update schema, cost.

## 7. Business rules and formulas

Draft window: the run starts at note confirmation plus the window; "Next morning 06:30" runs at 06:30 local; "Only when I ask" disables automatic runs. The provenance line states the actual elapsed time.

Reading time in minutes = max(1, round(words ÷ 160)); 197 words shows "about 1 minute", 390 "about 2 minutes", 512 "about 3 minutes".

Recipient count = active patrons (active or payment-retrying, not left) in the selected tiers at the moment of sending; the history row shows the count delivered.

Language versions: the primary version is in the language the note was spoken in when that language is in the set, otherwise the first in the set; other versions are drafted from the primary and the note rather than translated word for word.

Teaser = the first paragraph of the approved primary version, up to 400 characters, shown as "Latest for patrons" while the profile toggle is on.

Open rate = unique patrons with at least one Resend open event ÷ patrons delivered, as a whole percent, blank until the first event.

Join attribution: a patron is a join for an update when their subscription was created within seven days after that update's sentAt and no later update was sent before the join; upgrades count the same way. The same rule produces the Fans events sentence "Mira K. joined Courtside · 48 hours after "Clay block, week two"".

Checks: Sounds like you compares sentence length, exclamation count and vocabulary against the three examples. Private topics warns on any figure in a currency, on runway, reserves and burn, and on injury or treatment terms, allowing generic phrases such as "a week of costs" without figures. Coach warns when a name from the player's coach or team records appears and past updates do not name them. Opponent warns on commentary about the opponent's game beyond the result.

## 8. Acceptance criteria

C-AC-1. Given Arya's note of 11 Sep at 18:42 (0:52, result L 6-4 3-6 6-7(5) vs Kovalenko, mood confident) is confirmed with the window "Within 30 minutes", when the run completes, then a draft titled "Three set points, one lesson" of 197 words exists with status Awaiting approval, the "Built from" list shows the note, result, two voice pills and mood, and nothing has been sent.

C-AC-2. Given "Patron updates written in" is English and Deutsch, when the run completes, then two tabs appear with their own subject, body and status, and approving the English version leaves the Deutsch version Awaiting approval.

C-AC-3. Given the draft names "Marko" once and no past update names a coach, when the checks render, then "Names your coach" warns, and Fix changes "Marko and I" to "My coach and I" and re-runs the check to "Coach unnamed · Changed to "my coach", as in your past updates".

C-AC-4. Given Courtside (8) and Locker Room (3) are selected and Inside Track is not, when the recipients card renders, then the line reads "11 patrons · Inside Track gets it a day early with your call notes.", toggling Inside Track on changes it to "12 patrons · including Inside Track", and unchecking all three reads "No one selected" with Approve disabled.

C-AC-5. Given 11 recipients, Send now and the teaser on, when the player taps Approve & publish, then the confirm block reads "Send to 11 patrons now?" with "Emails can't be unsent. The teaser goes on your public profile too", and nothing is sent until Send is tapped.

C-AC-6. Given the player taps Send, when Resend accepts the batch, then the status is Published, the footer reads "Sent to 11 patrons via Resend", the audit log holds the text as sent and the patron ids, and the public profile shows the first paragraph as "Latest for patrons".

C-AC-7. Given the player chooses "Tomorrow · 07:00 your time" and confirms, when the page renders, then the status is Scheduled with a Cancel action, and at 07:00 Europe/Vienna the send occurs with the recipient count recomputed.

C-AC-8. Given the player taps Skip this draft and chooses "nothing to say yet", when the history renders, then the row shows Skipped with "You skipped it: "nothing to say yet"", the footer reads "Skipped. Nothing was sent.", Undo restores the draft, and no email exists in Resend.

C-AC-9. Given the player taps Shorter, when the rewrite returns, then the body is a 99-word version, the count line updates, the toast says edits above the fold were kept, and Restore original returns the 197-word text.

C-AC-10. Given Mira K. subscribed to Courtside 48 hours after "Clay block, week two" was sent and before any later update, when the history renders, then that row shows joins in 7d +2 including her, and Fans attributes her join to the same update.

C-AC-11. Given the drafting model returns a schema validation failure, when the editor opens, then the subject reads "Write it yourself", the body is empty, and the run is marked failed.

C-AC-12. Given a Free player, when they open `#/agent/content`, then the page renders dimmed with sample content, one explanation line and one "Start Pro trial" action, and no draft is generated from their notes.

## 9. Notifications produced

For you: "Draft ready: "<subject>"" with body "<n> words from last night's note. <tiers>. Nothing goes out until you approve.", once per run, respecting quiet hours (M-NOTIF-2). FYI: "Sent to <n> patrons"; "Scheduled update sent"; "Send failed"; "Opened by <p>% so far" once, 48 hours after sending.

## 10. Sharing scope

Coach: nothing (M-SHARE-1). Manager: nothing (M-SHARE-2); joins reach the manager only inside Fans health. Patrons: the version for their tier and language. Public profile: the teaser when allowed. Export (M-PRIV-2): all versions, checks, skip reasons and send records.

## 11. Analytics events

draft_run_completed (trigger, languages, words, elapsedMinutes, cost), draft_viewed, subject_swapped, rewrite_requested (variant), body_edited, check_warned (kind), check_fixed (kind), check_overridden (kind), recipients_changed (tiers, count), send_time_changed, teaser_toggled, update_published (count, languages, teaser, scheduled), schedule_cancelled, draft_skipped (reason), preview_sent. Product KPIs: draft approval rate (target above 50 percent), notes-to-published ratio (target above 70 percent), open rate by tier, joins attributed per update, warn override rate per check (above 50 percent for a month is a product alert).

## 12. Out of scope and open questions

Out of scope for Release 1: social media posting; images and video in updates; per-patron personalisation beyond tier sections (PRD-04); reply threads inside the app; A/B testing of subjects; the Fan Agent's use of updates (PRD-10).

Open questions: the cost targets in section 3 are placeholders against the 15 percent ceiling in PRD-00 section 6; whether "Next morning 06:30" should be the default, since a draft arriving 26 minutes after a loss may be read in the car park; whether the patron language set may include Deutsch as the prototype shows, and where a patron chooses their language (PRD-04 or PRD-11); whether generic cost phrases should pass the money check as section 7 proposes.

Inconsistencies found between the prototype and PRD-00. Timing: the header and Settings say the draft arrives within 30 minutes of each note and the editor says "drafted 06:12, 26 minutes after your Match Scribe upload", yet the note was recorded at 18:42 the previous evening and the Match Scribe pipeline shows an overnight analysis at 02:00 UTC before the draft; PRD-00 M-GATE-1 treats 06:12 as a scheduled fire. Calendar: the prototype labels 11 September 2026 a Thursday while the Mindset Coach shows "Saturday 12 September". Word count: the static count line reads "418 words · about 3 minutes to read" before the script replaces it with 197. Languages: Preferences has English and Deutsch selected but the editor shows one version and one approval, against M-LANG-3. Skip: the history quotes a reason ("nothing to say yet") that the Skip control never asks for, and Undo reloads the page. Gate: the dashboard card's Approve & publish toasts "Published to 11 patrons" in one tap with no confirm block or M-GATE-2 sentence, while the page version is two-step. Copy rule: `renderCaHist` renders missing open rates with a long dash character, against the project's writing rule for UI copy. Order: the history is not in date order (28 July sits between 21 August and 10 August). Money check: "Nothing about money or injuries" passes while the draft says "a week of costs for a first-round cheque", so the rule needs the precision in section 7. Provider: the prototype names Claude Sonnet; PRD-00 section 7 names only a structured-output LLM with provider disclosure in Data & safety.
