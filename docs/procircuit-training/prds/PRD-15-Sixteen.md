# PRD-15 · Sixteen

Version 0.1 · 19 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00 · Siblings: PRD-06 (Mindset Coach), PRD-14 (Resonance), PRD-02 (Match Scribe)

Prototype reference: `procircuit-training.html` v0.2, the Training tab carrying both tools. Sixteen holds the four-phase rehearsal, the three capture paths (Listen, Tap it in, Sample set), the set summary with the interval strip, the routine pattern and the session history. It is the visual and behavioural reference for this document. Resonance in the same file is specified by PRD-14.

---

## 1. Purpose and job to be done

Roughly seventy percent of a match is the time between points, and it is the only part of it a player fully controls. Jim Loehr's work on that window is forty years old and still the most practical mental training in tennis: four phases between the end of one point and the start of the next, done the same way every time, so that at 4-5 in the third the player is not deciding what to do.

The Mindset Coach already suspects the failure. Arya's existing pattern reads "After a tiebreak loss, you write about rushing the second serve (3 of 4)", inferred from the language in her notes. Sixteen turns the inference into a measurement: the median gap between her points, how steady it is, and how much shorter it gets after a point she lost. That last number is the whole product. It is the routine going missing at exactly the moment it was built for, and it is invisible to everyone, including her coach, because nobody stands courtside with a stopwatch at an M25.

Sixteen is also the cheapest agent-adjacent surface in the product to run: no model call, no third-party API, no stored media, nothing that costs a cent per session.

Job statement: "Drill the routine until it is automatic, then tell me honestly whether it survives a lost point."

Success: at least half of Pro players who record one set record a second within three weeks; the median after-a-loss delta narrows across a player's first ten sets; the routine pattern is dismissed less than 25 percent of the time; no player is ever told that shorter is better.

## 2. Where it lives

### 2.1 Surface placement

PRD-14 established the Training tab inside the Mindset Coach at `/agent/mindset?tab=training`. Sixteen sits beside Resonance there, as a second tool, not as a new nav item.

The Training tab presents the two tools as top-level tabs: **Resonance** and **Sixteen**. Each is one scrolling column of cards rather than a second level of tabs, which keeps the phone layout to a single tab row.

Sixteen's column, in order: the rehearsal card, the mirror card with its three capture modes, the routine pattern card, the session history, and the boundary card.

Entry points beyond the tab:

- The quick-actions sheet behind the floating capture button gains **Rehearse the routine**, alongside Breathe (PRD-14), Record a note, Scan a menu and Scan a receipt. Ninety seconds in a hotel room is the commonest use and it should not require navigating to it.
- The Mindset Coach's routine pattern links into the last set.
- Match Scribe's review state gains one optional line when a set was mirrored within the same hour: "Sixteen read 58 points from this session." It links, it does not summarise.

Sessions and rehearsals both run in a full-screen dialog over whatever route the player is on, never as a route of their own.

### 2.2 Code placement

| Where | What goes there |
|---|---|
| `apps/web/app/agent/mindset/` | the Sixteen tool column, the mode chooser, the history view |
| `packages/ui/sixteen/` | `PhaseRing`, `StillRehearsal`, `TapPad`, `IntervalStrip`, `RoutinePattern`, `SetSummary` |
| `packages/shared/routine/` | the gap classifier, the interval statistics, the pattern thresholds; pure functions with fixture tests, no DOM |
| `packages/shared/onset/` | the microphone analyser: spectral flux, adaptive threshold, onset detection, point segmentation |
| `apps/api` | the session and point write endpoints, the pattern recalculation, the overnight match-linking job |
| `packages/db` | the three new tables in section 7 |

Like Resonance, Sixteen imports nothing from `packages/actions`. It has no side effect on the outside world, makes no model call, and touches no credential.

### 2.3 What it is not allowed to become

It does not score technique, judge shot selection, track the score, or tell a player they played badly. It times gaps. The one hard limit it recognises is the 25-second serve clock, and even that is shown as a line rather than a scolding. "Shorter is better" is the failure mode this product must never teach, because a player who rushes is already losing and a tool that rewards rushing makes it worse.

## 3. Users and entitlements

Player on Free: the rehearsal only, all three rep counts, with the still variant. The mirror card renders locked per M-TIER-1 with one "Start Pro trial" action.

Player on Pro: everything. Tap and Listen capture, the summary, the history, the routine pattern.

Player on Elite: the correlation surfaces that place the after-a-loss delta against results and mood, and Agent Studio control of the pattern thresholds.

The split is a decision, filed as A30.

Coach via share link: the routine pattern statement, its confidence and its evidence count, on by default, consistent with PRD-06's "Coach sees patterns, not notes". Never the set, never the gaps, never the score. Manager via share link: nothing, with no switch. Public profile: nothing.

Players under 18: no additional gate. Sixteen collects no health information and no biometric identifier, which is the single most useful difference between it and Resonance.

## 4. Session contract

**Trigger.** Player-initiated only. No schedule, no background run, no notification that starts anything.

**Inputs.** For the rehearsal: the phase definitions and the rep count. For the mirror: the capture mode, the serving state in Tap mode, and the live microphone signal in Listen mode.

**Outputs.** One `routine_sessions` row and its `routine_points` rows on save. A rehearsal writes a `rehearsal_runs` row. Nothing leaves the device otherwise.

**Approval gate.** Not applicable in the M-GATE-2 sense: nothing is sent anywhere. The destructive controls are Discard on the summary, which writes nothing, and "Delete all Sixteen data" in Settings, which uses the two-step confirm with a consequence sentence.

**Failure behaviour.** A mirror session with fewer than four valid gaps refuses to produce a summary and says why in the player's terms ("Not enough points with a believable gap. Real gaps run about 10 to 25 seconds."). If the microphone is unavailable or denied, Listen says so and the other two modes remain. If the app is backgrounded mid-session the clock pauses and says so on return.

**Audit.** Sessions appear in the player's Data and safety view as plain rows (M-GATE-4, ST-24). Deletion writes an `approvals` row of type `routine_delete_all`.

**Cost.** Zero marginal cost. No model, no vendor, no media storage.

## 5. Surfaces and states

### 5.1 Rehearse the routine

Header: title, a badge showing the total length, and the line "Four phases, five times through. Stand up and do it, with a racquet if one is to hand. It is rote learning, and that is the point: at 4-5 in the third you should not be deciding what to do next."

The four phases are listed with their durations, drawn from Loehr:

| # | Phase | Seconds | Instruction |
|---|---|---|---|
| 1 | Positive response | 4 | Turn to the baseline. Head and shoulders up, racquet at the throat in your other hand. |
| 2 | Relaxation | 5 | Walk to the back fence. Eyes on the strings. Keep moving, stay loose. |
| 3 | Preparation | 5 | Three feet behind the baseline. Strong stance. Say the score out loud and see the point. |
| 4 | Ritual | 4 | Your bounces, the same number every time. Then serve. |

Eighteen seconds a rep, three, five or eight reps.

The rehearsal dialog shows a four-segment ring that fills segment by segment, the phase name, the instruction, and readouts for phase, seconds left and reps. Audio and haptic cues mark each phase change and a different cue marks each completed rep. Controls: still variant, pause, end.

The still variant replaces the ring with a large countdown number and the phase name, on automatically under `prefers-reduced-motion: reduce` and available as a manual toggle. The rehearsal's motion is content, not decoration, so it cannot simply be switched off; it has to be replaced.

Ending shows one card: the rep count, the line "Same four phases, same order, every point. The only thing that should change out there is the score you say out loud.", and Close.

### 5.2 Mirror a practice set

Header: "Prop the phone on the fence, or hand it to whoever is watching. Sixteen does not follow the ball. It works out where the points ended and times the gaps between them."

Three capture modes, each stating on its face what it can and cannot give:

| Mode | Gives you | Description |
|---|---|---|
| Listen | Gaps only | Phone on the fence. Finds the points from the sound of the ball. Gives you the gaps, not who won them. |
| Tap it in | Everything | You or your coach tap won, lost and serve. The only mode that can show what happens after a loss. |
| Sample set | No court needed | A practice set, so you can read the summary without going outside. |

That difference is structural, not an implementation gap. Audio tells you when points started and stopped and nothing about who won them, so Listen can report consistency and shot-clock breaches and cannot report the after-a-loss delta at all. It must be said on the card, not in a footnote.

Beneath, a card headed "What leaves the microphone": "Nothing. The sound is analysed on this phone and never recorded, stored or sent. Only the times of the ball strikes survive the session, and they stay here."

### 5.3 Listen

A live panel showing the interval strip as it builds, a strike-tick strip over the last eight seconds, an input level bar, and three readouts: points, last gap, strikes heard. A sensitivity toggle group (High, Normal, Low) with the line "Lower it if a neighbouring court is being counted."

States: starting, set in progress, no microphone, signal too quiet, ended.

### 5.4 Tap it in

A serving switch in the body ("Arya is serving this game. Flip it at each change of serve. The gap is the server's to set."), three readouts (points, last gap, median), and a two-state pad. Waiting for the point to end shows **Won** and **Lost** side by side; waiting for the serve shows one large **Serve struck**. An undo control steps back one tap. The state badge is a live region, because it is the only feedback the mode gives.

### 5.5 The set summary

Leads with the number that matters. With outcomes: "4.4s faster after a point you lost, measured on your service points", followed by one sentence of verdict. Without outcomes, it leads on variation and says plainly that the after-a-loss comparison needs Tap mode.

Four tiles: median gap, variation, over the 25-second clock, points read.

Then the interval strip: one bar per point, height is the gap, colour is whether the previous point was won or lost, receiving points dimmed, changeovers marked as faint vertical dashes rather than plotted, the median drawn as a labelled dashed line and the 25-second clock as a dashed red line, both on top of the bars. Under it, the legend and the count of changeovers left out.

With outcomes, a two-bar comparison of the median gap after a win against after a loss.

Then the set label, Practice set or Match, and Save or Discard. Saving ends on a single card naming what the coach will and will not see.

### 5.6 The routine pattern

Rendered in the PRD-06 pattern idiom so it reads as the same object in both places: statement, confidence badge, explanation, evidence dots, and the actions "Show the last set" and "Not a pattern". Dismissal dims it and reads "Dismissed. It comes back if it shows up in two more sets."

### 5.7 History

Four tiles (median gap, variation, after a loss, over the clock), a trend chart of the after-a-loss delta by set with a zero line labelled "no difference", and the session list. Each row opens its own set read-only. Closer to zero is better, and the chart says so.

### 5.8 What Sixteen does not do

- It does not judge your technique, score the match or tell you that you played badly. It times gaps, and that is all it times.
- Shorter is not better. The number that matters is how steady you are, not how fast. The 25-second clock is the only hard limit here.
- Listening cannot tell your court from the one next to it, or a rally from someone hitting against a wall. Check the point count before you trust a set.
- No audio is recorded or kept, in any mode, at any point. There is nothing to delete because nothing is written.

## 6. Functional requirements

SX-1 (Must). The rehearsal runs the four phases in order at the durations in section 5.1, for three, five or eight reps, with an audio cue and a haptic pulse at each phase change, each independently switchable.

SX-2 (Must). The rehearsal offers a still variant that replaces the ring with a countdown and the phase name, enabled by default under `prefers-reduced-motion: reduce`.

SX-3 (Must). The rehearsal can be paused and resumed without losing its position.

SX-4 (Must). All three capture modes classify a gap by one shared rule (section 8). No mode applies its own thresholds.

SX-5 (Must). A gap at or above the changeover threshold is recorded as a changeover, excluded from every statistic, marked on the strip, and counted in a line under it. The 25-second clock does not run during a changeover and a changeover is never counted as a breach of it.

SX-6 (Must). Listen detects ball strikes from spectral flux in a band derived from the device sample rate, segments them into points on a gap threshold, and keeps a single-strike group when it stands alone between two real gaps, so that aces and double faults are not discarded.

SX-7 (Must). Listen never records, stores, uploads or exports audio. Only onset timestamps exist, and only for the duration of the session.

SX-8 (Must). Listen offers three sensitivity settings and shows a live strike count, so a player can tell whether a neighbouring court is being counted before trusting the set.

SX-9 (Must). Listen marks every point's outcome as unknown. The summary states that the after-a-loss comparison is unavailable rather than inferring it.

SX-10 (Must). Tap records an outcome for each point and a gap between the outcome tap and the following serve tap, carries a serving state the tapper controls, and offers a single-step undo.

SX-11 (Must). A mirror session with fewer than four valid gaps produces no summary and explains what a believable gap looks like.

SX-12 (Must). The headline metric is the difference between the median gap after a lost point and after a won point, computed on service points when at least twelve are available and on all points otherwise, with the basis named in the copy.

SX-13 (Must). Variation is reported as a percentage by the definition settled in A28, and the same definition is used in the summary, the history and the trend.

SX-14 (Must). The summary states the count of gaps over the 25-second clock, excluding changeovers.

SX-15 (Must). The interval strip draws the median and the clock as labelled reference lines above the bars, and colours bars from the chart palette only. Semantic status tokens are reserved for the clock.

SX-16 (Must). A set is saved only on an explicit Save, and is labelled Practice set or Match before saving. Discard writes nothing.

SX-17 (Must). A routine pattern exists only when at least three sets with outcomes support it; its magnitude is the median of the most recent three and its confidence uses the same window (A28 note in section 8).

SX-18 (Must). "Not a pattern" dismisses it, removes it from the coach link, and re-raises it only after two further supporting sets.

SX-19 (Must). The coach link carries the pattern statement, confidence and evidence count while the boundary switch is on, and never the set, the gaps or the score.

SX-20 (Must). Settings > Data and safety carries "Delete all Sixteen data" as a two-step confirm with a consequence sentence naming the set count.

SX-21 (Must). Free players get the rehearsal; the mirror card renders locked with one upgrade action.

SX-22 (Must). Backgrounding the app pauses any running session and says so on return.

SX-23 (Should). A set is linked to the Match Scribe note recorded nearest it, by the rule settled in A25 (PRD-14), so the Mindset Coach can put the two together.

SX-24 (Could). A scoreboard or draw feed supplies serve order for Listen, removing the manual serving state (A29).

SX-25 (Won't, Release 1). Any judgement of technique, shot selection or score. Any stored audio. Any leaderboard, streak pressure or notification about a missed session. Any claim that a shorter or longer gap is better.

## 7. Data dictionary

`routine_sessions`

| Field | Type | Notes |
|---|---|---|
| id, player_id | uuid | RLS on player_id |
| started_at, ended_at | timestamptz | |
| context | enum `practice`,`match` | the label the player chose |
| capture | enum `listen`,`tap`,`sample` | |
| device | text | |
| points_read | smallint | valid gaps, excluding changeovers |
| changeovers | smallint | |
| median_gap_s | numeric(4,1) | |
| variation_pct | smallint | per A28 |
| after_win_s, after_loss_s | numeric(4,1), nullable | null when outcomes are unknown |
| delta_s | numeric(4,1), nullable | after_loss minus after_win, negative is faster |
| over_clock | smallint | gaps above 25 seconds, changeovers excluded |
| basis | enum `serve`,`all` | which points the headline used |
| linked_note_id | uuid, nullable | set by the overnight job |
| tournament_id | uuid, nullable | |
| created_at | timestamptz | |

`routine_points`

| Field | Type | Notes |
|---|---|---|
| id, session_id | uuid | cascade delete |
| seq | smallint | order within the set |
| gap_s | numeric(4,1), nullable | the gap preceding this point's serve |
| changeover | boolean | |
| serving | boolean, nullable | null in Listen |
| prev_won | boolean, nullable | null in Listen |
| rally_strikes | smallint, nullable | free from Listen, null elsewhere |

Roughly sixty rows a set, a few sets a week. Cheap, and it is what makes "Show the last set" and the strip possible at all. There is no audio artefact and no media reference anywhere in this schema.

`rehearsal_runs`: `id`, `player_id`, `run_at`, `reps_planned`, `reps_completed`, `still_variant boolean`, `seconds`.

Pattern: reuses the PRD-06 `patterns` table with `kind = 'routine'`, the third value alongside `mental` and `physical`. PRD-14 proposed the value; Sixteen is what generates it. PRD-06 owns the wording, the badge and the sharing.

Database grants: the `console` role has no access to `routine_sessions`, `routine_points` or `rehearsal_runs`, on the same footing as notes and moods.

## 8. Business rules and formulas

**One gap rule, shared by every capture path.** Below 4 seconds is a mis-tap or a stray strike and is discarded. At or above 45 seconds is a changeover or a set break: recorded, excluded from every statistic, marked on the strip. Above 200 seconds the player has walked off and the gap is discarded. All three thresholds are placeholders (section 14).

The 45-second boundary exists because players are given 90 seconds at every odd game and 120 at a set break, while an inter-point gap tops out near 25 plus a time violation. Nothing legitimate lives between 30 and 45 seconds, so the boundary is comfortable.

**Point segmentation from audio.** Strikes within 3.5 seconds of each other belong to the same point. A group of two or more strikes is a point. A group of one strike is a point only when the gaps either side are both at or above the minimum, which keeps aces and double faults in and stray bangs out. The gap is measured from the last strike of one point to the first strike of the next.

**Onset detection.** Spectral flux summed across the 1.5 to 8 kHz band, with the bin range derived from the audio context's actual sample rate, against an adaptive threshold of the rolling median plus a sensitivity multiplier times the mean absolute deviation, with a 220 ms refractory period. Sensitivity multipliers 2.2, 3.2 and 4.6.

**Basis.** The headline uses service points when at least twelve are available, because the gap is the server's to set, and all points otherwise. The basis is named in the copy rather than hidden.

**The headline.** `delta = median(gaps after a lost point) - median(gaps after a won point)`, computed on the basis, and reported only when at least four gaps fall on each side. Negative means faster after a loss.

**Variation.** In the prototype, the coefficient of variation of all gaps on the basis. This is a known weakness: because the distribution mixes after-a-win and after-a-loss gaps, the variation figure partly re-reports what the delta already measures, and it will fall automatically as the delta narrows. The alternative is the within-group variation, the residual once the win and loss effect is removed, which is what the history card's promise actually describes. This is A28 and it must be settled before any player accumulates history, because changing it later invalidates every trend already drawn.

**Pattern thresholds.** A routine pattern exists when at least three sets with outcomes support it. Its magnitude is the median delta of the most recent three sets. Its confidence is Strong when at least 60 percent of those sets show a delta of 2 seconds or more, otherwise Emerging. Dismissal follows PRD-06: excluded from insights and the coach link, re-raised after two further supporting sets.

**Determinism in the prototype.** The sample set and the seeded history are generated from a fixed seed, so every reviewer sees the same numbers. This is a prototype rule, not a product rule, and the generator does not ship.

## 9. Acceptance criteria

SX-AC-1. Given five reps selected, when the rehearsal runs, then it cycles the four phases at 4, 5, 5 and 4 seconds, cues each change, completes in 90 seconds, and ends on the closing card.

SX-AC-2. Given the operating system reports reduced motion, when the rehearsal starts, then the ring is not rendered, a countdown and the phase name are, and the manual toggle restores the ring.

SX-AC-3. Given the rehearsal is paused for thirty seconds, then the phase and the seconds left are unchanged on resume.

SX-AC-4. Given a set containing six changeover gaps of about 90 seconds, when the summary renders, then none of them appears as a bar, each is marked on the strip, the median is an inter-point figure between about 10 and 25 seconds, none is counted against the 25-second clock, and the legend states how many were left out.

SX-AC-5. Given an ace, which produces one strike between two real gaps, when Listen segments the set, then that point is kept and the two gaps either side of it are measured.

SX-AC-6. Given a stray strike inside a rally, then it is absorbed into that rally rather than treated as a point.

SX-AC-7. Given Listen completes a set, then every point's outcome is unknown, the summary leads on variation, and it states that the after-a-loss comparison needs Tap mode.

SX-AC-8. Given no audio is available or permission is denied, then Listen says so plainly, records nothing, and the rehearsal, Tap and the sample set still work.

SX-AC-9. Given a full set in any mode, then no audio file, buffer or reference exists in storage, in the export, or in any request payload.

SX-AC-10. Given a tapped set of 58 points with at least four gaps after wins and four after losses on the basis, then the summary states the delta, names the basis, and the two-bar comparison matches the two medians.

SX-AC-11. Given a tapped set with three valid gaps, then no summary is produced and the message explains what a believable gap looks like.

SX-AC-12. Given a saved set labelled Match, then the history row reads Match and the trend includes it.

SX-AC-13. Given three sets with outcomes whose deltas are at or beyond 2 seconds, then the routine pattern exists with confidence Strong, its magnitude is the median of the most recent three, and the evidence dots show which sets support it.

SX-AC-14. Given the player taps "Not a pattern", then it is dismissed, leaves the coach link within one minute, and is re-raised only after two further supporting sets.

SX-AC-15. Given the coach opens the share link, then the statement, confidence and count are visible and no set, gap, score or point row is.

SX-AC-16. Given "Delete all Sixteen data" is confirmed, then every session, point and rehearsal row for that player is removed, the consequence sentence named the set count, and an `approvals` row of type `routine_delete_all` is written.

SX-AC-17. Given a Free player opens the Training tab, then the rehearsal runs in full and the mirror card is dimmed with exactly one "Start Pro trial" action.

SX-AC-18. Given the app is backgrounded mid-session, then the clock does not advance and the player is told on return.

## 10. Notifications produced

None in Release 1.

Sixteen never asks for a decision, so it never earns a For-you notification, and there is no FYI worth sending: a set is read the moment it ends. Nothing about a missed session, a broken streak or a worsening trend. A tool that pushes a player about their routine the morning after a loss is working against them, and the Mindset Coach already owns the one morning message the product is allowed (M-NOTIF-1).

## 11. Sharing scope and privacy

Sixteen collects no health information and no biometric identifier. That is a material difference from Resonance and it keeps this feature out of the consent, guardian and retention machinery that PRD-14 section 11 has to carry.

**Audio.** Listen opens a microphone and analyses a live stream. It never records, buffers to storage, uploads or exports audio. Only onset timestamps exist, and only in memory for the length of the session. The copy says so in the interface, and the implementation must make it structurally true: no `MediaRecorder`, no audio buffer retained beyond the analyser window, no blob, no upload path.

This matters more than it first appears. A phone on a fence at a public club picks up other players, coaches, spectators and children. Nothing is stored, but the first-use permission copy must say plainly that the microphone is listening and that nothing is kept, and it must distinguish analysing from recording, because those are different things to a venue and to the people nearby.

**Coach scope.** The routine pattern statement, its confidence and its evidence count, on by default, consistent with PRD-06's boundary switch. Never a gap, a set, a point row or a score. M-SHARE-1 extends accordingly.

**Manager scope.** Nothing, with no switch.

**Retention.** Session and point rows persist until the player deletes them or deletes the account, under the M-PRIV-2 cooling-off period. There is no media artefact to retain.

**Claims.** The permitted claim is descriptive: it times the gaps between your points and shows you how steady they are. Nothing may state or imply that using it improves results, reduces errors or affects performance. And the copy must never frame a shorter gap as better, which is a product-integrity rule before it is a compliance one.

**Tournament rules.** Open and important: the prototype offers a Match label, but whether a phone may be placed courtside and used to collect data during an official ITF, ATP or WTA match is governed by the rulebooks on electronic devices and coaching, and this document does not assert what they currently permit. Until that is verified with each governing body, the Match label should be treated as applying to practice matches only, and the interface should not encourage courtside use during sanctioned play. Filed as A31.

## 12. Analytics events

`sixteen_opened` (tier, has_sets), `rehearsal_started` (reps, still_variant), `rehearsal_completed` (reps_completed), `rehearsal_abandoned` (rep_reached), `still_rehearsal_toggled` (on, auto), `capture_mode_selected` (mode), `mirror_started` (mode), `mic_permission` (granted, denied, unavailable), `sensitivity_changed` (level), `signal_quality_warning`, `mirror_completed` (mode, points_read, changeovers, delta_s, variation_pct, over_clock, basis), `mirror_refused` (reason), `set_saved` (context), `set_discarded`, `set_reopened`, `pattern_created` (confidence), `pattern_dismissed`, `pattern_restored`, `coach_share_toggled`, `sixteen_data_deleted`.

Product KPIs: share of Pro players who record a second set within three weeks; median after-a-loss delta by set number, which is the improvement curve; share of Listen sessions flagged low quality, which is the honest measure of whether Listen is good enough to ship; pattern dismiss rate below 25 percent; rehearsal completion rate.

## 13. Implementation plan

### 13.1 Gating

The rehearsal, Tap and the summary are gated on nothing and can be built immediately. Listen is gated on A27, because the platform question may remove it from the web build entirely.

A28, the definition of variation, must be settled before the first player saves a set.

### 13.2 Build steps

**Step 1.7 · Rehearsal and Tap (Phase 1, new epic E20).** Read first: this document sections 5, 6 and 8, PRD-06 section 4, Baseline motion and the tabs idiom.

Build: the Sixteen column on the Training tab, the rehearsal dialog with the four-phase ring, the still variant and pause, the Tap pad with the serving state and undo, the shared gap classifier and statistics in `packages/shared/routine`, the summary with the interval strip, the set label, the history, the routine pattern in the PRD-06 idiom, and the `routine_sessions`, `routine_points` and `rehearsal_runs` migrations with RLS and the `console` denial.

Done when: the four phases run at the right durations with the phone silent; reduced motion turns on the still variant; a set containing 90-second gaps produces an inter-point median and marks the changeovers; a set with three valid gaps refuses a summary; the pattern appears at three supporting sets and dismisses correctly; Playwright passes at 320 to 1440 in both themes with no horizontal overflow.

Prompt: "Build Sixteen's rehearsal and Tap capture from `docs/PRD-15-Sixteen.md` sections 5, 6 and 8. No microphone in this step. The gap classifier and the statistics go in `packages/shared/routine` as pure functions with fixture tests, including a fixture set containing changeovers and one containing aces. Follow Baseline: chart tokens for data, semantic tokens only for the clock."

**Step 4.5 · Listen (Phase 4, gated on A27).** Read first: this document sections 5.3, 8 and 11, decision A27.

Build: `packages/shared/onset`, the live panel, the sensitivity control, the first-use microphone consent step, and the segmentation with the ace rule.

Done when: fixture traces, including a recorded practice set and a deliberately noisy one with a neighbouring court, segment correctly; a single-strike group between two real gaps is kept; a stray strike inside a rally is absorbed; no audio buffer, blob or upload exists anywhere in the code path, proven by a test; the band is derived from the sample rate rather than assumed.

Prompt: "Add Listen from `docs/PRD-15-Sixteen.md` sections 5.3 and 8. Audio must never be recorded, buffered to storage or uploaded. Prove it with a test that fails if `MediaRecorder` or any upload path appears in the module. Derive the analysis band from the audio context sample rate."

**Step 5.x · Correlation (Phase 5, Elite).** The match link from A25 and the placement of the routine pattern alongside the mental and physical ones in PRD-06.

**Removed before shipping:** the sample capture mode, the seeded history and its reset button, and the "Prototype: fill with a set" control in Tap mode. All four exist only to make the prototype reviewable without a court. The reset button's shipped equivalent is "Delete all Sixteen data" in Settings.

### 13.3 Porting the prototype

`procircuit-training.html` carries both tools and is the port source for the Training tab as a whole. Follow PROCIRCUIT-CONTEXT section 10: read the Arya lines, apply the persona adapter, apply insertions bottom-up by line number, then grep for leaked words.

Storage keys: `pc.sx` and `pc.sxprefs` in the Arya file, `pc.ln.*` in Neumayer, `pc.sb.*` in Berger.

Persona adaptation: Neumayer needs an invented history under the real-player governance in PROCIRCUIT-CONTEXT section 6.2, with no fabricated coach involvement, and the coach-link line must not name a coach. Berger needs the same. The leak word list gains "Marko" for the Neumayer port, which appears in Sixteen's boundary card.

The port also carries Baseline v1.1's reduced-motion, reduced-transparency and 44px rules into the three player files, which PROCIRCUIT-CONTEXT section 2 still lists as outstanding. `procircuit-training.html` v0.2 has them and is the source.

## 14. Out of scope and open questions

Out of scope for Release 1: any analysis of the point itself, rally length as a reported metric, video, score tracking, opponent comparison, a social or leaderboard dimension, and Read, the serve-anticipation trainer, which is its own document when its turn comes.

### New rows for the review register

**A27. Does Listen ship on the web at all.** Decision needed. A practice set runs 30 to 50 minutes with an analyser in an animation-frame loop and the screen awake throughout, on a phone strapped to a fence, often in the sun. There is no Screen Wake Lock in the prototype, and screen lock suspends the detector mid-set. The options are a wake lock, which leaves a lit warm screen for the better part of an hour, or making Listen a native feature of the Capacitor shells, or dropping it and shipping Tap alone. This is the same class of question as A23 for Resonance's changeover mode and an order of magnitude larger.

**A28. The definition of variation.** Decision needed before any player accumulates history. The coefficient of variation over all gaps partly re-reports the after-a-loss delta, because the distribution is bimodal by construction, so the headline consistency figure will improve automatically as the delta narrows. Within-group variation, the residual once the win and loss effect is removed, is what the history card's promise describes and is the cleaner metric, at the cost of being harder to explain. The same window question applies to the pattern's confidence ratio, which should use the same three-set window as its magnitude.

**A29. How serve order is known in Listen mode.** Decision needed. Options: leave it unknown and accept that Listen reports on all points, ask once who serves first and alternate on detected game boundaries, which is fragile, or take it from a draw or scoreboard feed where one exists. Without it, Listen cannot restrict the headline to service points, which is the basis Tap uses.

**A30. The tier split.** Decision needed. This document assumes rehearsal on Free, capture and history on Pro, correlation and threshold control on Elite.

**A31. Courtside device use during sanctioned matches.** Decision needed, and it requires reading the current ITF, ATP and WTA rulebooks rather than assuming. The prototype offers a Match label. Until each governing body's position on placing a phone courtside and collecting data during a sanctioned match is confirmed, Match should mean practice matches, and the interface should not encourage courtside use in sanctioned play.

### Placeholders awaiting a number (register section D)

The gap minimum of 4 seconds, the changeover boundary of 45 seconds and the maximum of 200. The rally split of 3.5 seconds. The onset refractory period of 220 ms, the 1.5 to 8 kHz band, and the sensitivity multipliers 2.2, 3.2 and 4.6. The basis switch at twelve service points. The minimum of four valid gaps for a summary, and four on each side for the delta. The phase durations of 4, 5, 5 and 4 seconds. The pattern minimum of three sets, the 2-second support threshold and the Strong ratio of 0.6.

### Open questions

Whether the rehearsal should appear in the history at all, or stay a drill with no record beyond a count. Whether a player should be able to set their own phase durations, given that Loehr's figures are a template rather than a law and a taller server's ritual takes longer. Whether the strip should be ordered by point or by game, which would make the changeover marks structural rather than incidental. Whether a coach tapping a set in should be able to do it from the coach link on their own phone rather than the player's, which would make the coach link read-write for the first time and is a larger decision than it looks. And whether the after-a-loss delta should be reported at all for a set under about forty points, where the medians rest on very few observations.
