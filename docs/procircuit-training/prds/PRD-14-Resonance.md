# PRD-14 · Resonance

Version 0.1 · 19 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00 · Siblings: PRD-06 (Mindset Coach), PRD-08 (Conditions and equipment), PRD-12 (Settings)

Prototype reference: `procircuit-resonance.html` v0.2, published as a standalone Baseline-styled file. It carries the three session modes, the resonance rate test, the live phase-lock panel, the still pacer, the session summary, the calm trend and the boundary card. It is the visual and behavioural reference for this document; it is not yet ported into the three player files (section 13.3).

---

## 1. Purpose and job to be done

A player at #487 has no sports psychologist, no team and no room of her own. She has a phone, a bag and ninety seconds at a changeover. The Mindset Coach already reads her notes back to her and names patterns; what it cannot do is give her something to do in the ninety seconds before she serves at 4-5 in the third.

Resonance is that something. It is a paced breathing tool set to the player's own resonance frequency, the breathing rate at which her heart rate swing is largest and the breath and the heart reinforce each other rather than fight. The rate is found once with a five-block test and then used for the rest of the season. Three lengths cover the three moments that matter: five minutes before she goes on, ninety seconds at a changeover, and eight minutes with a longer out breath after a late finish, which is the night she cannot sleep.

It is the first ProCircuit surface that makes no model call at all. There is no prompt, no structured output and no per-run token cost, which matters against the unit economics in TECH-ARCHITECTURE section 5 (A$10.83 against a A$7.35 cap). It is also the first surface that touches physiological data, which is what makes section 11 the most important section in this document.

Job statement: "Before I go on, at the changeover and after a late match, give me one thing to do with my breath that works without thinking, and tell me honestly whether it is working."

Success: at least 45 percent of Pro players run a session in the week before a tournament; median coherence rises over a player's first six weeks; the "what this does not do" card is read by at least 70 percent of players who enable the camera; no player ever sees a physiological number described as a health measurement.

## 2. Where it lives

### 2.1 Surface placement

Resonance is not a new agent and does not get a sidebar item. The product's spine is agents, and a Games or Wellbeing nav item would dilute that and invite a feature graveyard. It lives inside the Mindset Coach.

`/agent/mindset` gains a Tabs group in the Baseline tabs idiom, the same pattern the Tournament Agent uses for Shortlist and Calendar: **Today**, **Patterns**, **Training**. Today and Patterns are the existing PRD-06 content, moved under tabs without other change. Training holds Resonance, and later its siblings (section 14). The tab is reflected in the URL as `/agent/mindset?tab=training` so it can be linked and so the back button behaves.

A session runs in a full-screen dialog over whatever route the player is on, not as a route of its own. This matters because the two commonest entries are not from the Mindset Coach at all:

- The quick-actions sheet behind the floating capture button gains a fourth item, **Breathe**, alongside Record a note, Scan a menu and Scan a receipt. This is the changeover path and it must be reachable in one tap from any route.
- The mobile tab bar's More sheet lists Resonance under the Mindset Coach.

The Mindset Coach's dashboard card gains one line when a session was run in the last 24 hours ("Breathed for 5 minutes yesterday, 74 percent coherence"), and nothing when none was.

### 2.2 Code placement

| Where | What goes there |
|---|---|
| `apps/web/app/agent/mindset/` | the Tabs group, the Training tab, the mode chooser and the history view |
| `packages/ui/resonance/` | `BreathPanel` (the phase-lock visual), `StillPacer`, `RateTestChart`, `CoherenceRing`, `SessionSummary`; tokens only, both themes, 44px targets, rem sizing |
| `packages/shared/breath/` | the pacer waveform, the coherence calculation, the RSA quadrature measure, the resonance-test scoring; pure functions with fixture tests, no DOM |
| `packages/shared/ppg/` | the camera pulse reader: frame sampling, detrend, peak detection, inter-beat interval, the signal-quality gate |
| `apps/api` | the session and test write endpoints, the overnight match-linking job |
| `packages/db` | the three new tables in section 7 |

Resonance imports nothing from `packages/actions`, because it has no side effect on the outside world. That is the whole reason it can be built early: there is no credential it can touch and nothing it can send.

### 2.3 What it is not allowed to become

No readiness score, no recovery score, no training-load figure, no sleep inference and no advice about whether to play. Those are the products the category drifts into, and every one of them is a medical-device conversation in Australia. The boundary is stated in the interface (section 5.5) and enforced in review, not just intended.

## 3. Users and entitlements

Player on Free: the pacer only. All three modes, audio and haptic cues, the still pacer, a default rate of 6.0 breaths a minute. No camera, no coherence, no history beyond the current session. The measurement surfaces render locked per M-TIER-1 with one "Start Pro trial" action.

Player on Pro: the resonance rate test, the camera pulse, coherence scoring, session history and the calm trend.

Player on Elite: everything in Pro, plus the correlation surfaces that place coherence against check-ins, moods and results (section 5.4), and Agent Studio control of the pre-match reminder cadence.

The tier split is a decision, not a settled fact, and is filed as A26.

Coach via share link: nothing by default, and nothing at all unless the player turns on the heart-data switch, which is off on every account (section 11). Manager via share link: nothing, with no switch. Public profile: nothing.

Players under 18: physiological data collection requires the guardian consent flow from M-ID-3 (A11). Until that flow exists, the camera path must be unavailable to any account whose date of birth puts them under 18, and the pacer alone is offered. This is a hard gate, not a preference.

## 4. Session contract

**Trigger.** Player-initiated only. There is no schedule and no background run. The optional pre-match reminder (section 10) is a notification, not a run.

**Inputs.** The player's resonance rate and its measurement date, the chosen mode, the preference set (sound, haptics, still pacer, camera), and, when the camera is on, the live pulse signal. Nothing else. No notes, no rankings, no schedule.

**Outputs.** One `breathing_sessions` row on save, and nothing else. No notification, no message, no external call, no model call.

**Approval gate.** Not applicable in the M-GATE-2 sense: Resonance takes no action in the world. The only destructive control is Discard on the summary, which is immediate and does not write a row, and "Delete all Resonance data" in Settings, which follows the two-step confirm with a consequence sentence.

**Failure behaviour.** If the camera signal drops below the quality gate for more than five seconds, the session falls back to the pacer alone, tells the player once ("Lost the pulse signal. Hold your fingertip still."), and marks the session `source = pacer_only` from that point. Coherence is not scored for a session that spent more than 30 percent of its length below the gate; the summary says so rather than showing a misleading number. If the page is backgrounded, the session pauses and says so on return; it does not silently keep counting. A session that is never saved leaves no row.

**Audit.** A saved session writes to `agent_runs` only in the degenerate sense that it is not an agent run, so it does not. It appears in the player's own Data and safety view (M-GATE-4, ST-24) as a plain data row, and its deletion is an `approvals` row of type `resonance_delete_all`.

**Cost.** Zero marginal cost. No model, no third-party API, no storage beyond a few hundred bytes per session.

## 5. Surfaces and states

### 5.1 Training tab, Resonance card

Header: title, the line "Breathing at your own resonance rate: before you go on, at the changeover, and after the match. The goal is the moment your heart rate and your breath lock into the same rhythm." Chips: the player's rate, the signal source, the tier badge.

Mode chooser, three selectable items in the Baseline `.item` idiom, each with an icon, name, description and a right-hand duration and ratio:

| Mode | Length | Ratio | Description |
|---|---|---|---|
| Before you go on | 5 min | even | "Seated, five minutes, phone in your hand." |
| Changeover | 1:30 | even | "Ninety seconds, sound and vibration only. The phone can stay face down." |
| After the match | 8 min | 4 in, 6 out | "Longer out breath than in. For the nights after a late finish." |

Then a primary "Start session" and a secondary "Use the camera for heart rate" with a line stating what the camera does.

### 5.2 The session dialog

Full screen, `role="dialog"`, `aria-modal`, focus moved in on open, focus trapped, focus returned on close. Escape ends a running session to the summary and closes from the summary.

Header: mode name, the rate badge, and four icon controls: still pacer, phone down, pause, end.

The panel is the feature. The breath is a lime line with a ball at the right edge rising and falling on the pacer waveform; the heart rate is drawn behind it as a quieter neutral line with a soft fill. When coherence passes the lock threshold the panel takes a lime ring and a "Locked in" badge. That convergence is the entire teaching mechanism and no text explains it, because it does not need to.

Readouts, three across: heart rate in bpm, coherence as a percentage, time left.

States: running; paused (including the automatic pause when the app is backgrounded, with a line on return); face down (screen near black, a single dot, audio and haptics only, tap anywhere to return); still pacer (waves hidden, the cue word, a breath count, and a ring that fills once across the session, so the only movement is slow and monotonic); pacer only (camera unavailable or below the gate, coherence hidden); summary; saved.

### 5.3 Summary and the end state

Coherence ring and figure, a one-line verdict in plain language, then four tiles: time in lock, heart rate start to end (each averaged over twenty seconds, never a point on the breathing swing), breaths, and length. Below, a replay chart of the whole session with the in-lock stretches shaded, and Save or Discard.

After Save the dialog does not return to the app. It shows a single card reading **"Put the phone away."** with the line "That is the whole session. Nothing else to do here, and nothing else worth reading before you walk on." and one Close.

This is a requirement, not a flourish (RS-19). A pre-match tool that competes for the ninety minutes before a match is working against the person paying for it.

### 5.4 Your rate, and History

Your rate shows the current rate, its measurement date, the bar chart of heart rate swing by tested rate with the winner in lime, and a Run the test again action. A demo-speed switch shortens blocks for demonstration and must not exist in the shipped build (section 13.2).

History shows the calm trend by week, three tiles (average coherence, best session, time breathing) and the session list. On Elite it also shows the correlation card placing coherence against check-ins, moods and results, labelled with its sample size and never as a causal claim.

### 5.5 The boundary card

Titled "What Resonance does not do", carried on the Training tab in the same voice as Fuel's equivalent:

- It is not a medical device and it makes no health claim.
- Camera heart rate is a relative signal for training. It is not a clinical heart rate variability measurement and it should never be read as one.
- There is no readiness score and no recovery score. Nothing here tells you whether to play.
- Camera frames are read once on your phone and never stored or sent anywhere.

Beneath it, the coach-link switch, off by default, with the line "Marko sees your matches, shortlists and patterns, never this."

## 6. Functional requirements

RS-1 (Must). A session runs at the player's stored resonance rate, or 6.0 breaths a minute when none is stored, in one of three modes with the lengths and ratios in section 5.1.

RS-2 (Must). The pacer waveform is a raised cosine with the mode's inhale to exhale ratio, and phase transitions are marked by an audio cue and a haptic pulse, each independently switchable.

RS-3 (Must). The session runs correctly with no measurement of any kind. Every measurement surface is additive, and the pacer never depends on a signal being present.

RS-4 (Must). The still pacer replaces the scrolling waves with the cue word, a breath count and a single monotonic ring, and is enabled by default whenever the operating system reports `prefers-reduced-motion: reduce`. It is also available as a manual toggle on every tier.

RS-5 (Must). Face-down mode blanks the screen to a single indicator and runs on audio and haptics alone. Its platform behaviour is settled by A23.

RS-6 (Must). Camera pulse reading samples the rear camera at the device frame rate, detrends, detects peaks, derives inter-beat intervals, and applies a signal-quality gate before any number is shown. Below the gate no heart rate is displayed and no coherence is scored.

RS-7 (Must). Raw frames are processed on the device and never written to storage, never uploaded and never included in an export. Only the derived per-session figures in section 7 are persisted (M-PRIV-4, proposed).

RS-8 (Must). Coherence is computed over a rolling thirty-second window by the definition settled in A24, smoothed, and expressed as a whole percentage.

RS-9 (Must). A session is in lock while coherence is at or above the threshold in section 8; time in lock is accumulated and reported.

RS-10 (Must). Start and end heart rate are each the mean of a twenty-second window rather than an instantaneous reading.

RS-11 (Must). A session is saved only on an explicit Save. Discard writes nothing.

RS-12 (Must). The resonance test runs five blocks at 6.5, 6.0, 5.5, 5.0 and 4.5 breaths a minute, measures the heart rate swing at the breathing frequency in each, and proposes the rate with the largest swing. The player saves or discards the result.

RS-13 (Must). A saved rate supersedes the previous one; previous tests are retained and visible, never overwritten.

RS-14 (Must). The test requires a camera signal above the quality gate for at least 70 percent of each block, and abandons with an explanation rather than proposing a rate from a poor signal.

RS-15 (Must). Heart data is excluded from every share scope by default and reaches the coach link only while the explicit switch is on. There is no switch that shares it with a manager.

RS-16 (Must). Settings > Data and safety carries "Delete all Resonance data" as a two-step confirm with a consequence sentence naming the count and stating that it cannot be undone.

RS-17 (Must). Free players get the pacer and the still pacer; the rate test, camera, coherence and history render locked with one upgrade action (M-TIER-1).

RS-18 (Must). Under-18 accounts cannot enable the camera until the guardian consent flow exists (M-ID-3, A11).

RS-19 (Must). A saved session ends on the "Put the phone away" card with one Close and no onward navigation.

RS-20 (Must). Backgrounding the app pauses the session and says so on return; the clock never advances while the page is hidden.

RS-21 (Should). A session is linked to the match it preceded by the rule settled in A25, so the Mindset Coach can compare prepared matches with unprepared ones.

RS-22 (Should). The Mindset Coach may raise a routine pattern from Resonance history using the shared Pattern entity with `kind = routine` (PRD-06 section 6), worded and shared by PRD-06's rules.

RS-23 (Should). One optional FYI reminder before a match in an Entered event, off by default (section 10).

RS-24 (Could). A wearable source (Apple Watch, Garmin, Whoop) replaces the camera where the player has one connected, using the same schema with `source = wearable`.

RS-25 (Won't, Release 1). Any score describing readiness, recovery, stress, sleep or fitness. Any export of a beat-to-beat series. Guided audio sessions with a voice. Breath holds or hyperventilation protocols of any kind.

## 7. Data dictionary

`breathing_sessions`

| Field | Type | Notes |
|---|---|---|
| id, player_id | uuid | RLS on player_id |
| started_at, ended_at | timestamptz | |
| mode | enum `pre`,`changeover`,`post` | |
| rate_bpm | numeric(3,1) | the rate actually paced |
| inhale_ratio, exhale_ratio | smallint | 1,1 or 4,6 |
| planned_seconds, actual_seconds | integer | a short session is still a session |
| source | enum `pacer_only`,`camera`,`wearable` | |
| device | text | |
| coherence_pct | smallint, nullable | null when the signal gate was not met |
| lock_pct | smallint, nullable | |
| hr_start, hr_end | smallint, nullable | twenty-second means |
| breaths | smallint | |
| still_pacer | boolean | |
| quality_pct | smallint, nullable | share of the session above the signal gate |
| linked_note_id | uuid, nullable | set by the overnight job, A25 |
| tournament_id | uuid, nullable | |
| created_at | timestamptz | |

No waveform, no beat-to-beat series, no per-second array. The replay chart on the summary is drawn from memory during the session and is not persisted. That is a deliberate constraint and it is what keeps the data-protection surface small.

`resonance_tests`

| Field | Type | Notes |
|---|---|---|
| id, player_id | uuid | |
| run_at | timestamptz | |
| block_seconds | smallint | 120 in the shipped build |
| blocks | jsonb | `[{rate_bpm, rsa_amp_bpm, coherence_pct, quality_pct}]`, five entries |
| chosen_rate_bpm | numeric(3,1) | |
| source | enum `camera`,`wearable` | |
| superseded_at | timestamptz, nullable | set when a later test is saved |

Player preferences, on the existing settings store: `breath_sound`, `breath_haptics`, `breath_still_pacer`, `breath_camera_enabled`, `breath_coach_share` (default false), `breath_prematch_reminder` (default false).

The player's current rate is the `chosen_rate_bpm` of the latest test with `superseded_at is null`. It is not denormalised onto `players`.

Database grants: the `console` role has no access to `breathing_sessions` or `resonance_tests`, on the same footing as notes, audio, moods and photos (BUILD-PLAN conventions). Support sees that a player uses Resonance only through aggregate counts, never a row.

## 8. Business rules and formulas

**Pacer.** Cycle length is 60 divided by the rate in breaths a minute. Within a cycle, inhale occupies `inhale / (inhale + exhale)` of the cycle and the position follows a raised cosine in each phase, so the turn at the top and bottom is smooth rather than a corner.

**Resonance search.** Five rates from 6.5 down to 4.5 in steps of 0.5. Two minutes per block in the shipped build. The measured quantity is the peak-to-peak heart rate swing at the breathing frequency, taken as twice the quadrature magnitude of the block's heart rate series at that frequency, which is robust to noise and to baseline drift in a way a simple maximum minus minimum is not. The winner is the largest swing. Blocks below 70 percent signal quality invalidate the test.

**Coherence.** In the prototype, the Pearson correlation between the heart rate series and the pacer position over a rolling thirty seconds, clamped at zero, smoothed with an exponential moving average, expressed as a percentage. The conventional alternative is the share of spectral power in the 0.04 to 0.15 Hz band at the breathing frequency. These are different numbers and the choice is A24. Whichever is chosen, it is frozen before any player accumulates history, because a definition change silently invalidates every trend chart drawn before it.

**Lock threshold.** 65 percent, a placeholder (section D of the register).

**Signal quality gate.** A block of at least five detected peaks in the last six seconds with an inter-beat interval median between 0.3 and 1.5 seconds and a standard deviation under 220 ms. Placeholder values.

**Plausible range.** Coherence above 95 percent on a camera signal is treated as a measurement artefact, not a triumph: the session is marked `quality_pct` low and the number is withheld. A tool that hands a player a perfect score teaches them to distrust it.

**Backgrounding.** The session clock advances only while the page is visible. A gap of more than two seconds between frames pauses the session.

## 9. Acceptance criteria

RS-AC-1. Given Arya has a stored rate of 5.5 measured 22 August, when she opens the Training tab, then the chip reads "Your rate: 5.5 breaths a minute" and the mode chooser opens on Before you go on.

RS-AC-2. Given she starts a five-minute session with no camera, then the pacer runs at 5.5, audio and haptic cues fire at each phase change, no heart rate or coherence is shown, and the summary offers Save with a length and a breath count but no coherence.

RS-AC-3. Given the camera is enabled and the signal is above the gate, when the session passes ninety seconds, then coherence rises from below 30 percent toward the lock threshold rather than starting high, and the panel takes the lock state when it crosses 65.

RS-AC-4. Given the signal falls below the gate for six seconds mid-session, then the player is told once, the heart rate readout blanks, `source` becomes `pacer_only` from that point, and the summary states that coherence was not scored if more than 30 percent of the session was below the gate.

RS-AC-5. Given the operating system reports reduced motion, when a session starts, then the still pacer is on, the scrolling waves are not rendered, and the only movement is the ring filling once across the session.

RS-AC-6. Given the session dialog is open, when the player presses Escape, then a running session ends to the summary; pressing Escape again closes the dialog and focus returns to the control that opened it.

RS-AC-7. Given the app is backgrounded for thirty seconds mid-session, then the clock shows the same time left on return and the player is told the session paused.

RS-AC-8. Given a saved session, then exactly one `breathing_sessions` row exists, no waveform or beat-to-beat data is stored anywhere, and the dialog shows the "Put the phone away" card with one Close.

RS-AC-9. Given Discard on the summary, then no row is written and the history is unchanged.

RS-AC-10. Given the rate test completes five valid blocks with the largest swing at 5.5, then 5.5 is proposed, the bar chart shows all five swings with 5.5 in lime, and saving supersedes the 22 August test without deleting it.

RS-AC-11. Given a block falls below 70 percent signal quality, then the test abandons with an explanation and proposes nothing.

RS-AC-12. Given the coach-link switch is off, which is its default, when Marko opens the coach link, then no heart rate, coherence, session or rate appears anywhere on it; given the player turns it on, then the pattern statement appears within one minute and the underlying figures still do not.

RS-AC-13. Given a Free player opens the Training tab, then all three modes run, and the rate test, camera, coherence and history are dimmed with exactly one "Start Pro trial" action (M-TIER-1).

RS-AC-14. Given an account whose date of birth puts the player under 18, then the camera control is unavailable with an explanation, and the pacer runs normally.

RS-AC-15. Given "Delete all Resonance data" is confirmed, then every `breathing_sessions` and `resonance_tests` row for that player is removed, an `approvals` row of type `resonance_delete_all` is written, the consequence sentence named the session count, and the export produced afterwards contains no Resonance data.

RS-AC-16. Given the player requests an export (M-PRIV-2), then it contains the session rows and test rows as stored and no derived health interpretation of any kind.

## 10. Notifications produced

One optional FYI, off by default: "Time to breathe" sent 90 minutes before the scheduled start of a match in an Entered event, body "Five minutes before you go on.", action opens the session dialog in Before you go on. It respects quiet hours and the M-NOTIF-1 cap, and it is the only notification this surface produces.

No For-you notifications. Resonance never asks for a decision, so it never earns one.

Nothing about a missed session, a broken streak or a declining trend. A tool that nags a player the morning after a loss is worse than no tool.

## 11. Sharing scope and privacy

This is the section that decides whether the feature is safe to ship.

Heart rate, inter-beat intervals and anything derived from them are health information under the Privacy Act and the Australian Privacy Principles. Collecting them takes ProCircuit from a business tool into a category with its own consent, retention, access and breach obligations.

**Proposed new master requirement, M-PRIV-4 (physiological data).** Physiological signals are processed on the device and never transmitted or stored in raw form. Only the derived per-session figures in PRD-14 section 7 are persisted. They are excluded from every share scope by default, carry their own consent at first use, are deletable independently of the account, are included in the player export, and are never used to produce a score describing the player's health, readiness or recovery. The `console` role has no access to them. Under-18 accounts require guardian consent before collection.

**First-use consent.** Enabling the camera for the first time shows a consent step, not a toast: what is collected, that frames never leave the phone, what is stored, who can see it, and how to delete it. Declining leaves the pacer fully working, which is the point of building the pacer to stand alone.

**Coach scope.** Off by default. When on, the coach sees a routine pattern statement and its evidence count in the PRD-06 idiom, never a coherence number, never a heart rate, never a session list. M-SHARE-1 is extended accordingly.

**Manager scope.** Nothing, with no switch. A parent who funds the season does not get their child's heart data.

**Retention.** Session rows persist until the player deletes them or deletes the account, and follow the M-PRIV-2 cooling-off period. There is no separate audio or image artefact to retain, because none is created.

**Claims.** Nothing in the interface, the marketing site or the app store listing may state or imply that Resonance improves performance, aids recovery, reduces stress or affects health. The permitted claim is descriptive: it paces your breathing and shows you whether your heart rate followed. This is an ACL matter as much as a privacy one, and it belongs in the legal review named in section 13.1.

## 12. Analytics events

`resonance_opened` (tier, has_rate), `session_started` (mode, source, still_pacer, rate_bpm), `session_completed` (mode, actual_seconds, coherence_pct, lock_pct, quality_pct), `session_saved`, `session_discarded`, `session_abandoned` (seconds_in), `facedown_entered`, `still_pacer_toggled` (on, auto), `camera_enabled`, `camera_consent_declined`, `signal_lost` (seconds_in), `rate_test_started`, `rate_test_completed` (chosen_rate_bpm, spread), `rate_test_abandoned` (reason), `rate_saved`, `boundary_card_read`, `coach_share_toggled`, `resonance_data_deleted`, `prematch_reminder_toggled`, `prematch_reminder_tapped`.

Product KPIs: share of Pro players with a saved rate; sessions per player per tournament week; median coherence by week since first session; share of sessions ending on Save rather than abandon; camera consent acceptance rate; share of sessions marked low quality, which is the honest measure of whether camera PPG is good enough to ship.

## 13. Implementation plan

### 13.1 Gating

Two things must happen before the measurement half is built. The legal review named in PRELAUNCH-CHECKLIST's "before engineering commits" block must cover this feature explicitly: physiological data consent, the guardian branch, the deletion and export paths, and the claims boundary in section 11. And A23, A24 and A25 must be settled, because each of them changes code that is expensive to change later.

The pacer half is gated on none of that and can be built immediately.

### 13.2 Build steps

**Step 1.6 · The pacer (Phase 1, new epic E19).** Read first: this document sections 5, 6 and 8, PRD-06 section 4, Baseline motion and the tabs idiom.

Build: the Tabs group on `/agent/mindset`, the Training tab, the mode chooser, the session dialog with the pacer, audio and haptic cues, the still pacer, the pause and background behaviour, face-down mode, the summary without measurement, the "Put the phone away" end state, the Breathe item in the quick-actions sheet, and the `breathing_sessions` migration with RLS and the `console` denial.

Done when: a session runs at the correct rate and ratio in all three modes with the phone silent and the screen off where A23 allows; reduced motion turns on the still pacer; Escape and focus behave as RS-AC-6; a backgrounded session does not advance; Free and Pro both run the pacer; Playwright passes at 320 to 1440 in both themes with no horizontal overflow.

Prompt: "Build the Resonance pacer from `docs/PRD-14-Resonance.md` sections 5, 6 and 8. No camera and no coherence in this step. `packages/shared/breath` holds the waveform as pure functions with fixture tests. Follow Baseline for motion, both themes, 44px targets and rem sizing."

**Step 4.4 · Measurement (Phase 4).** Read first: this document sections 7, 8 and 11, the legal review output, decisions A22 and A24.

Build: `packages/shared/ppg`, the camera path with the signal-quality gate, the first-use consent step, coherence scoring, the lock state, the summary with measurement, the resonance test and its chart, the history and calm trend, the `resonance_tests` migration, the delete-all action in Settings, and the export.

Done when: a poor signal never produces a number; a session above 95 percent coherence is withheld as an artefact; deletion removes every row and writes its approval; the export round-trips; under-18 accounts cannot reach the camera; the boundary card is present and reachable before the camera can be enabled.

Prompt: "Add measurement to Resonance from `docs/PRD-14-Resonance.md` sections 7, 8 and 11. Raw frames must never be written, uploaded or exported. Coherence uses the definition settled in A24. Prove the quality gate with fixture tests on recorded signal traces, including a deliberately poor one."

**Step 5.x · Correlation (Phase 5, Elite).** The match link from A25 and the routine pattern in PRD-06, once there is enough history for either to mean anything.

**Removed before shipping:** the demo-speed switch on the rate test, the "Prototype: skip 60s" control, the simulated physiology model, and the seeded sample history with its reset button. All four exist only to make the prototype reviewable. The reset button's shipped equivalent is "Delete all Resonance data" in Settings.

### 13.3 Porting the prototype

`procircuit-resonance.html` is standalone and needs porting into the three player files before it can be reviewed in context. Follow the discipline in PROCIRCUIT-CONTEXT section 10: read the Arya lines, apply the persona adapter, apply insertions bottom-up by line number, then grep for leaked words.

Storage keys follow the existing convention: `pc.breath`, `pc.res`, `pc.rprefs` in the Arya file; `pc.ln.*` in Neumayer; `pc.sb.*` in Berger.

Persona adaptation: Arya's rate is 5.5, measured 22 August 2026. Neumayer needs an invented rate and history under the real-player governance in PROCIRCUIT-CONTEXT section 6.2, with no fabricated staff involvement. Berger needs the same with German cities. The leak word list for the Berger port gains nothing new; the Neumayer list gains "Marko" in the coach-link line of the boundary card.

The port is also the moment to carry Baseline v1.1's reduced-motion and reduced-transparency rules into the three player files, which PROCIRCUIT-CONTEXT section 2 already flags as outstanding. `procircuit-resonance.html` v0.2 has them and should be the source.

## 14. Out of scope and open questions

Out of scope for Release 1: wearable integration, guided voice sessions, breath holds, any protocol involving hyperventilation, sharing a session with anyone, a social or leaderboard dimension, and the two sibling tools (Sixteen, the between-point routine trainer, and Read, the serve-anticipation trainer) which are separate documents when their turn comes.

### New rows for the review register

**A22. Does Release 1 ship camera heart rate at all.** Decided 19 September 2026 by Manu Dubey: yes. Camera PPG and coherence are in Release 1 on Pro. The consequences are accepted and recorded in section 11: health information from day one, the guardian branch on the critical path, the "coherence, never HRV" naming rule, and derived figures only with no raw waveform stored.

**A23. Changeover mode and the locked screen.** Decision needed. The mode is sold as "the phone can stay face down", which a web page cannot honour: the screen locks, animation frames suspend, and the pacer and its audio stop. Three options: take a Screen Wake Lock, which works on modern Android Chrome and Safari but leaves a lit, warm screen in a bag; schedule the full ninety seconds of audio into the Web Audio graph up front so it survives suspension, which is the only option that works with the screen actually off; or cut changeover from the web build and make it a native feature of the Capacitor shells. Recommendation: schedule the audio. Related and not a decision, just a fact to record: `navigator.vibrate` does not exist in iOS Safari, so haptics are Android-only on the web and iPhone gets audio alone until the native shell.

**A24. The definition of coherence.** Decision needed before any player accumulates history. The prototype uses a rolling Pearson correlation against the pacer; the conventional definition is spectral power at the breathing frequency within the 0.04 to 0.15 Hz band. They produce different numbers on the same session. Changing the definition later silently invalidates every trend chart drawn before it.

**A25. How a session links to a match.** Decision needed. Options: a session started within a window before a match in an Entered event (how long a window), the first Match note saved after the session on the same day, or an explicit "before a match" control the player taps. Without a link the Mindset Coach cannot compare prepared matches with unprepared ones, which is the comparison that justifies the feature's place in the product.

**A26. The tier split.** Decision needed. This document assumes pacer on Free, measurement and the rate test on Pro, correlation and cadence control on Elite. The alternative is to put the rate test on Elite as a premium moment, at the cost of an artificial split between the test and the measurement it depends on.

### Placeholders awaiting a number (register section D)

The lock threshold of 65 percent. The signal-quality gate values (five peaks in six seconds, inter-beat median between 0.3 and 1.5 seconds, standard deviation under 220 ms). The 70 percent block-quality requirement for a valid rate test. The 30 percent threshold above which coherence is withheld. The 95 percent artefact ceiling. The five test rates and their 0.5 spacing. The two-minute block length. The 90-minute pre-match reminder lead time.

### Open questions

Whether a player whose resonance rate falls outside the 4.5 to 6.5 search range is served by widening it or by accepting the nearest edge. Whether the rate should be re-measured on a schedule, and if so how often, given that fitness and illness move it. Whether the still pacer should be the default for everyone rather than an accessibility fallback, since it is calmer and uses less battery. Whether a session should be offered at all on a distress morning, or whether PRD-06's someone-to-call card should suppress the whole Training tab for that day, which is a clinical review question rather than a product one.
