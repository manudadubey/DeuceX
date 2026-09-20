# PRD-10 · Fan Agent

Version 0.2 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/agent/fan` (the sample conversation, the voice and escalation controls, the answer bank), the "Fan Q&A" toggle on `#/profile`'s What's shown pane, the Fan Agent row in Settings > Agents, and the locked Fan Agent sidebar item. Patrons, tiers and payouts are PRD-04; drafted patron updates and the player's voice profile are PRD-05; the public page itself is PRD-11.

---

## 1. Purpose and job to be done

Twelve people pay Arya to follow a season that mostly happens in qualifying rounds nobody streams, and the questions they ask arrive at odd hours from odd time zones: how did the match go, are you playing Poznań, which racquet do you use. Answering each one herself is the same problem as writing patron updates herself, except worse, because a conversation never stops the way an email does. The Fan Agent is a conversational layer on the patron page that answers from what the player has already said in public, in her own voice, and stops the moment a question turns personal. It never guesses about money, an injury, another player's business or anything to do with a minor; it hands those straight back to the player, labelled as unanswered, and it always tells the patron that the reply came from the agent, not from her. The page header states the deal plainly: "Answers patron questions on your public page in your voice, from your own words. Escalates anything personal to you."

Job statement: "Let my patrons ask what they want to ask, answer the ones I've already answered somewhere before, in my own words, and put everything else in front of me instead of guessing, so twelve people never wait three days for 'how did the match go' and I never have to explain something I'd rather have kept to myself."

Success: at least half of patron questions are answered without ever reaching the player; every escalated question is seen by the player within 48 hours; not one agent reply, across the life of the product, states a figure about money, names an injury, discusses another player's private matter or identifies a minor.

## 2. Users and entitlements

Player on Elite: full agent, answering real patrons from the player's own approved answer bank, public facts and published updates, with an "Early access" badge and a feedback link in the header (M-TIER-4). Player on Pro: `#/agent/fan` renders a sample conversation (the reference thread with patron Hanna L.) under the studio-bar banner "This is a preview. The conversation below is an example.", with "Upgrade to Elite" the only live action; the voice and escalation controls and the answer bank are visible but inert. Player on Free: the Fan Agent is not part of the plan (PRD-00 section 4); the surface is absent, not shown locked.

Patron: the only audience the agent replies to; a patron of any active tier can ask a question on the patron page and receives a labelled reply or sees their question marked as passed to the player. A non-paying visitor to the public profile does not see or use the Fan Agent; the studio bar states this directly, "Patrons only." Coach via share link: nothing from this surface (M-SHARE-1). Manager via share link: nothing from this surface (M-SHARE-2); the agent produces no money or expense data for the manager to see. Downgrade from Elite (M-TIER-2): past conversations remain readable by the player, the agent stops answering new questions, and patrons are told the feature has paused rather than seeing it vanish.

Under-18 players (M-ID-3): the Fan Agent is available on the same terms once the guardian has switched the public profile on; the always-escalate rule covering minors (section 5) applies with the same force whether the player answering is an adult or a minor, since it protects third parties named in a conversation, not only the player.

## 3. Agent contract

Trigger. Event-driven: a patron submits a question on the patron page, and the agent attempts an answer or an escalation within seconds, streamed to the patron as it is written. There is no scheduled run; the only recurring process is a daily pass that rolls up escalated-and-unanswered questions into one summary for the player, so a quiet day of questions does not require checking the thread manually.

Inputs. The player's approved answer bank (question and answer pairs the player has written, or promoted from a confirmed Match Scribe note with the player's explicit permission on that note); the player's public bio, headline and season goal from `#/profile`; confirmed results and the ranking feed; the schedule and next entered tournament from the Tournament Agent; published patron updates from the Content Agent (PRD-05); the player's voice setting (Dry and direct by default, or Warmer, or Shorter); the fixed set of always-escalate categories and the one configurable category, Schedule. The agent never reads Match Scribe transcripts, ledger or reserve figures, or Mindset Coach insights (the studio bar states this: "It never sees notes, money or Mindset insights.").

Outputs. A streamed reply labelled "answered by the Fan Agent" for a question the agent is confident it can answer from its approved sources; an escalation record labelled "Escalated to you, not answered" with a one-line reason for anything else; a daily For-you notification only when at least one question is waiting, never one per question (M-NOTIF-1).

Approval gate. The agent answers directly once a question is judged answerable from approved sources; this is not a per-message approval gate in the way an outreach email or a patron update is, because the sources themselves were approved in advance by the player when she wrote or promoted them into the answer bank, and every reply carries the agent's label so the patron always knows who is speaking. Anything outside those sources, and anything in an always-escalate category, is never answered by the agent; only the player's own reply, typed and sent by her, reaches the patron for those. A previously sent agent answer can be retracted by the player at any time; retraction is immediate and irreversible in the sense that the original text is removed from the patron's view (M-GATE-3).

Failure behaviour. If the answering model is unavailable, the incoming question is queued exactly as an escalation, with the reason "The agent couldn't answer this one." If the answer bank cannot be loaded, no reply is attempted and every question queues for the player until it recovers. A low-confidence match against the answer bank never becomes a guessed answer; below the confidence threshold the question escalates rather than risking a wrong quote.

Audit. Every question, whether answered or escalated, is logged with the patron id, the text, the agent's confidence, and, for an answer, the source entries it drew from; every player reply, retraction and answer bank change is logged with who acted, when and from which device (M-GATE-4).

Cost. Target under A$0.01 per answered question (a short, retrieval-grounded reply on a small model), zero cost for an escalation beyond the classification step.

## 4. Surfaces and states

### 4.1 Fan Agent page (`#/agent/fan`)

Header: title, description "Answers patron questions on your public page in your voice, from your own words. Escalates anything personal to you. Elite, from v2.", badge "Elite, preview with sample data" on Pro (replaced by "Early access" plus a feedback link on Elite, M-TIER-4).

Studio bar (Pro preview): "This is a preview. The conversation below is an example." and "Patrons only. GPT-4o mini, streaming, grounded in your FAQ, bio, results and published updates. It never sees notes, money or Mindset insights.", with "Upgrade to Elite" (toast "Upgrade, Stripe Checkout") the only action.

"What patrons see" card: badge "Sample", subheading "Locker Room patron, yesterday evening." A four-turn thread: Hanna L. (Locker Room) asks "How did the Kovalenko match go? Couldn't find a score anywhere."; the labelled reply "Arya, answered by the Fan Agent" gives the score (lost 6-4 3-6 6-7(5), Genoa qualifying) and a line about the third-set breaker and the best twenty minutes since Bratislava; Hanna L. then asks "Are you going to Poznań? And honestly, how are you doing money-wise this month?"; the labelled reply answers the Poznań part (confirming by Thursday, a quarter-final there last year) and stops there; the money half of the same message becomes a separate escalation row, "Escalated to you, not answered", with the reason "'How are you doing money-wise' is personal. The agent didn't answer it and flagged it for you. Reply yourself, or let it stay unanswered." Footer: "Reply to Hanna" (toast "Elite feature, upgrade to reply" on Pro) and "Mark as handled".

"How it speaks" card: description "Tone from your updates. Adjust, don't invent." A Voice control (Dry and direct pressed by default, Warmer, Shorter). An "Always escalate" control with five toggles, Money, Injuries, Family and Other players pressed on, Schedule pressed off. A "Review before sending" switch, off by default: "Off: every reply goes out labelled 'answered by the Fan Agent', always. On: replies wait for you; one you read and approve goes out as your own words, because it is. There is no setting that hides the label on a reply you have not seen."

"Your answers it can use" card: description "Write these once. It quotes them rather than guessing." Three reference entries, each with an Edit action: "Which racquet?", "Wilson Blade 98 16×19, 305g, Luxilon Alu Power at 24/23 kg."; "Can I come and watch?", "Yes. Challengers are free or nearly free. Say hi after, not before."; "Why no coach at tournaments?", "Coaching by the week costs what a flight does. I block weeks with Marko between events." Footer: "Add an answer" (toast "Elite feature" on Pro).

States: fresh (as above); no questions waiting (the escalation queue empty, "Everyone's had an answer" style state, by analogy with the Fans page's equivalent empty state in PRD-04); model unavailable (every new question queues as escalation); answer bank empty (a first-run state prompting the player to write at least the three starter answers before turning the agent on); Pro preview (studio bar, all actions replaced with upgrade toasts); Elite live ("Early access" badge, feedback link, real patrons, real retraction).

### 4.2 Public profile and Settings (`#/profile`, `#/settings`)

Profile, What's shown pane: "Fan Q&A, Elite", description "Patrons ask, the Fan Agent answers in your voice, you review the ones it escalates.", shown as a disabled, unchecked switch when the player is not on Elite. Settings > Agents groups "Sponsor Agent, Fan Agent" as one dimmed row labelled "Elite, preview" linking to `#/agent/sponsor`, carrying an "Elite" badge, with no schedule selector since the agent is event-driven, not scheduled.

## 5. Functional requirements

FA-1 (Must). The agent answers only from the player's approved answer bank and from public facts already surfaced elsewhere in the product (bio, headline, season goal, confirmed results, schedule, ranking); it never reads Match Scribe transcripts, ledger, reserve or Mindset Coach data, matching the studio bar's own statement of scope.

FA-2 (Must). Every reply the agent sends on its own carries the label "answered by the Fan Agent" and no setting can remove it. With "Review before sending" on, a reply waits for the player; a reply the player has read and explicitly approved, edited or not, is sent as the player's own words without the label, and the approval is recorded (who, when, device, text as sent). A reply the player has not seen is never sent unlabelled. Decided 13 September 2026 (worksheet 10); wording to be checked by legal review before Release 2.

FA-3 (Must). Five categories always escalate rather than being answered: money, injuries, family or personal life, other players' private matters, and anything regarding a minor; these five cannot be disabled. Schedule is the one category the player may toggle, since schedule facts are already public elsewhere.

FA-4 (Must). A question matching an always-escalate category, or one the agent cannot answer with reasonable confidence from its approved sources, produces no drafted answer at all; it is queued as "Escalated to you, not answered" with a one-line reason, and nothing is guessed.

FA-5 (Must). The player can reply directly to an escalated question, sent as herself and never through the agent, or mark it handled without a reply; either clears it from the waiting queue.

FA-6 (Must). The player can retract any previously sent agent answer at any time; a retracted answer is removed from the patron's view and replaced with a neutral "removed by Arya" placeholder, and the retraction is logged (M-GATE-4).

FA-7 (Must). An answer bank entry is created by the player writing it directly, or by promoting a confirmed Match Scribe note into an answer; promoting a note requires the player's explicit, per-note permission before its content can be quoted to a patron.

FA-8 (Must). The agent quotes answer bank entries and public facts verbatim or close to it; it does not infer, extrapolate or invent detail beyond what its sources state, mirroring the Content Agent's own no-invention rule (PRD-05, C-3).

FA-9 (Must). The Voice control (Dry and direct, Warmer, Shorter) changes tone only; it never changes which questions are answered or escalated, or the facts in an answer.

FA-10 (Must). The conversation is available to any active patron regardless of tier, on the patron-facing page, never to a non-paying visitor of the public profile, consistent with the studio bar's "Patrons only" statement.

FA-11 (Must). On Free the Fan Agent is absent and unreachable; on Pro the page shows a sample conversation and inert controls under the preview banner, "Upgrade to Elite" the only path forward; on Elite it shows real patron conversations with an "Early access" badge and feedback link (M-TIER-1, M-TIER-4).

FA-12 (Must). The product maintains a blocklist of terms the agent will neither use nor answer around, a per-patron rate limit on questions within a rolling day, and a one-tap "Block this fan" action from the patron's row in Fans (PRD-04) that stops the agent responding to that patron immediately; none of this moderation layer exists in the current prototype (section 12).

FA-13 (Must). Every question, answered or escalated, and every reply, retraction or answer bank change, is recorded in the audit log with who acted, when, from which device, and, for an agent answer, which sources it drew from (M-GATE-4).

FA-14 (Must). If the answering model is unavailable, an incoming question is queued exactly as an escalation with the reason "The agent couldn't answer this one," never left unacknowledged.

FA-15 (Should). A low-confidence answer is never sent as if certain; the agent's confidence against the answer bank determines whether it answers or escalates, defaulting conservatively toward escalation.

FA-16 (Should). The answer bank view shows which entries have been quoted most often over the last thirty days, so the player can see which written answers are carrying the conversation.

FA-17 (Should). A daily digest groups escalated-and-unanswered questions into one For-you notification rather than one per question, so a busy day never exceeds the single notification the platform rule allows (M-NOTIF-1).

FA-18 (Could). When the same question is escalated three times without a covering answer bank entry, the agent suggests a draft entry for the player to approve and add.

FA-19 (Won't, Release 2). The agent initiating a conversation with a patron; it only ever responds to an inbound question. Answering in a language other than the interface's primary language is also Won't, since the Content Agent's multi-language pattern (PRD-05, M-LANG-3) is not yet extended to real-time chat.

## 6. Data dictionary

Fan question (one per patron message):

| Field | Type | Source | Notes |
|---|---|---|---|
| id | string | platform | |
| patronId, tierAtAsk | string, enum | Fans (PRD-04) | tier at the moment asked |
| text, askedAt | string, datetime | patron | |
| state | enum answered, escalated, handled | agent, player | |
| escalationCategory | enum money, injuries, family, otherPlayers, minors, lowConfidence, modelUnavailable | agent | null when answered |
| escalationReason | string | agent | one line, shown to the player |
| answerId | string or null | agent | set when answered |

Fan answer: id, questionId, text, sentAt, label ("answered by the Fan Agent", or none when reviewedBy is set), reviewedBy (nullable player approval reference), sourceRefs[] (answer bank entry ids or public fact keys), voiceSetting, retractedAt (nullable). Answer bank entry: id, question, answer, sourceType (manual, promotedNote), noteId (nullable), permissionGrantedAt (nullable), editedAt, quoteCount30d. Escalation category configuration: category, locked (boolean), enabled (boolean); the five always-escalate categories carry locked true. Blocklist term: id, term, addedAt. Rate limit state: patronId, windowStart, questionCount. Block record: patronId, blockedAt, reason (nullable). Run record (per question): id, trigger (question), patronId, inputsHash, model, confidence, cost.

## 7. Business rules and formulas

Answer confidence: the agent scores a candidate match against the answer bank and public facts; a score below the configured threshold escalates rather than answers, and the threshold defaults toward caution, meaning a genuinely uncertain match is treated as unanswerable rather than as a best guess.

Escalation category matching: an incoming question is classified against the five locked categories (money, injuries, family or personal life, other players' private matters, minors) and the one configurable category (Schedule); a question can match more than one category, and any match at all routes it to escalation rather than an answer, regardless of whether an unrelated part of the same message could have been answered (the Kovalenko and Poznań example shows the agent splitting a compound message, answering the schedule half and escalating the money half separately).

Rate limiting: a default ceiling of ten questions per patron per rolling twenty-four hours is proposed to prevent one patron from dominating the queue; the exact figure is a placeholder pending review (section 12).

Retraction: retracting an answer removes it from the patron's visible thread immediately and logs the original text, the retracting player and the time, so the audit trail keeps what was said even though the patron no longer sees it.

Note promotion: promoting a Match Scribe note into an answer bank entry requires a permission flag set on that specific note; the permission does not extend to any other note, and a note without permission set can never be quoted by the agent, matching the platform's wider rule that agents may only use what a player has explicitly allowed them to use (PRD-00 section 5.3, Note entity, field "agents that consumed it").

## 8. Acceptance criteria

FA-AC-1. Given a Locker Room patron, Hanna L., asks "How did the Kovalenko match go?", when the agent answers, then the reply states the score 6-4 3-6 6-7(5) in Genoa qualifying, is labelled "answered by the Fan Agent", and matches the confirmed result on file.

FA-AC-2. Given the same patron asks in one message both whether the player is going to Poznań and how she is doing money-wise, when the agent processes it, then the Poznań half is answered and labelled, and the money half appears as a separate escalation row reading "Escalated to you, not answered" with a reason quoting its personal nature.

FA-AC-3. Given an escalated question is waiting, when the player opens the thread, then she can either send her own reply or tap "Mark as handled", and either action removes the item from the waiting queue.

FA-AC-4. Given the player has previously sent an agent answer she regrets, when she taps Retract, then the original text disappears from the patron's view, a neutral placeholder appears, and the retraction is recorded in the audit log with a timestamp.

FA-AC-5. Given the answer bank entry "Which racquet?" exists with "Wilson Blade 98 16×19, 305g, Luxilon Alu Power at 24/23 kg.", when a patron asks which racquet the player uses, then the reply quotes that entry without adding a detail not present in it.

FA-AC-6. Given a patron asks a question naming another player's personal circumstances, when the agent classifies it, then it escalates under "other players" regardless of phrasing, and no draft answer is produced.

FA-AC-7. Given a player on Pro opens `#/agent/fan`, when the page renders, then the preview banner is shown, the sample Hanna L. conversation appears with the "Sample" badge, and "Reply to Hanna" and "Add an answer" both resolve to an upgrade prompt rather than a real action.

FA-AC-8. Given a player on Free opens the app, when the sidebar renders, then no Fan Agent entry appears and `#/agent/fan` is not reachable.

FA-AC-9. Given a player on Elite has the feature live, when a tenth question from the same patron arrives inside the rolling twenty-four hour window, then the eleventh is held with a rate-limit notice rather than answered or escalated.

FA-AC-10. Given the player blocks a fan from the Fans page, when that patron next sends a question, then the agent does not respond and the question is not added to the waiting queue; given the answering model is unavailable instead, any incoming question is queued exactly as an escalation with the reason "The agent couldn't answer this one."

FA-AC-11. Given the player promotes a Match Scribe note into an answer bank entry, when she has not yet granted permission on that specific note, then the agent cannot quote it, and the promotion itself requires that permission before completing.

FA-AC-12. Given three escalated-and-unanswered questions arrive on the same day, when the daily digest runs, then exactly one For-you notification is created summarising all three, not three separate notifications (M-NOTIF-1).

## 9. Notifications produced

For you: one daily digest, "N questions waiting for you", created only when at least one question is queued, with action Open; a same-day notification when a question is escalated under money, injuries, family, other players or minors and none has been raised yet that day, worded "A patron asked something personal, it's waiting for you." FYI: none by default; a weekly summary of questions answered and escalated is a Could for Release 2 (section 12).

## 10. Sharing scope

Coach: nothing (M-SHARE-1). Manager: nothing (M-SHARE-2); the agent produces no financial data. Patron: sees only their own conversation, never another patron's questions or answers. Public profile: nothing; the Fan Agent surfaces on the patron page only, never on the public, non-paying view of the profile.

## 11. Analytics events

fan_question_received (tier, category if escalated), fan_answer_sent (confidence, sourceCount), fan_question_escalated (category, reason), escalation_replied, escalation_marked_handled, answer_retracted, answer_bank_entry_added (manual, promoted), note_permission_granted, fan_blocked, rate_limit_triggered, voice_setting_changed, upgrade_cta_clicked, daily_digest_sent (count). Product KPIs: share of questions answered without escalation, median time to clear an escalated question, retraction rate, questions per patron per month.

## 12. Out of scope and open questions

Out of scope for Release 2: the agent initiating a conversation; multi-language replies; group or broadcast questions and answers; voice or audio replies; a public, non-patron version of the conversation.

Open questions: the exact rate-limit ceiling (ten per patron per rolling day is a placeholder); whether Fan Q&A should be gated by patron tier rather than open to all active tiers, since the sample shows a Locker Room patron but Profile's toggle does not distinguish tiers; how long a note-promotion permission remains valid, and whether it expires if the note is edited; whether the five always-escalate categories should be extendable, or whether the fixed set is itself the safety feature; a jurisdictional review of the minors rule given the product's international patron base; whether a Free-tier visitor should see any teaser at all, given PRD-00 gives Free nothing on this surface.

Inconsistencies found between the prototype and PRD-00: PRD-00's tier table (section 4) specifies three distinct states for the Studio agents, no access on Free, a preview on Pro, early access on Elite, but the prototype implements only the single Pro-style preview state, with no file evidence of a true Free lockout or a live Elite view. M-TIER-4 specifies an "Early access" badge and a feedback link for Elite features; the prototype's badge instead reads "Elite, preview with sample data" with no feedback link on either Studio agent's page. The "Say when it's the agent" control in "How it speaks" is built as a switch the player can apparently toggle off, which sits uneasily next to this document's Must requirement (FA-2) that the label can never be turned off; a fixed, non-interactive statement is the safer implementation. The Profile page's "Fan Q&A" toggle in What's shown is disabled and unchecked regardless of tier, while `#/agent/fan` itself behaves as a live, tappable preview on Pro; the two surfaces disagree about how the feature is switched on, and PRD-00 does not resolve which is authoritative.
