# PRD-18 · Field

Version 0.1 · 20 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00 · Siblings: PRD-06 (Mindset Coach), PRD-14 (Resonance), PRD-15 (Sixteen), PRD-16 (Margin), PRD-17 (Hold)

Prototype reference: `procircuit-field.html` v1, and the same tool embedded in the Training tab of `procircuit-dashboard.html`. The prototype holds the three subtests, the backward mask, the four-way central response, the eight-way dial, the Bayesian threshold estimator, the refresh-rate measurement and the summary with the field map. It is the visual and behavioural reference for this document.

---

## 1. Purpose and job to be done

A shape flashes in the middle of the screen and something else appears out at the edge. Both are gone in a fraction of a second, then a mask wipes the afterimage. The player reports both. The flash gets shorter until they cannot, and that duration is the number.

This is the useful field of view task, and it carries the best transfer evidence of anything in this category by a wide margin. A meta-analysis covering 44 studies from 17 randomised trials found training effects on targeted outcomes three to five times larger than other cognitive training, transfer to everyday function, fewer motor-vehicle collisions among older drivers, and gains that held across ten years. In a field where far transfer is usually absent, that is close to the only well-documented case of it.

The tennis mapping is the most direct of the five tools. Watching the ball while still registering that an opponent has committed to a side is a divided-attention problem across the visual field, which is exactly what subtest two measures.

Four caveats have to travel with all of that, and they travel inside the product, not only here.

The work is in older adults, not young athletes. The transfer was to driving and daily function, not to sport. Benefits needed at least ten hours of training. And roughly half of those trials were run by people with a financial interest in the training being sold.

The ten-hour figure is the one that shapes the product. Every other tool in this tab is built for the twenty minutes before a match. Field is not, and pretending otherwise would misrepresent the only strong evidence we have. So Field counts hours rather than sessions, says on its own page that it is not a primer, and tells a player where they stand against ten.

Job statement: "Widen what I pick up without moving my eyes, and be honest that this one takes hours rather than minutes."

Success: players who start Field accumulate hours rather than running it once; the tool never reports a number that is really a property of their screen; and no surface in the product implies a pre-match benefit.

## 2. Where it lives

### 2.1 Surface placement

PRD-14 established the Training tab inside the Mindset Coach. Field is a tool in it at `/agent/mindset?tab=training`, and is not a new nav item.

Field sits in **The longer game** group beside Hold, not in the Before you play group. Its card shows the current divided-attention threshold and the hours logged, which is the only card in the tab that shows a cumulative figure rather than a recent one.

Field's own column, in order: the mode chooser, the hours card, the "this one is not a primer" card, and the boundary card. The hours card carries the running total and states the ten-hour figure directly.

Field contributes nothing to the Mindset Coach's daily insight and produces no pattern. A millisecond threshold is not something to put in a coaching voice.

### 2.2 Code placement

| Path | Holds |
|---|---|
| `apps/web/app/agent/mindset/training/field/` | route, mode chooser, hours card, history |
| `packages/ui/field/` | stage renderer, mask, response pad and dial, summary, field map |
| `packages/shared/quest/` | the Bayesian threshold estimator |
| `packages/shared/refresh/` | refresh-rate measurement and frame quantisation |
| `apps/api/field/` | run create, run save, history read |
| `packages/db/` | `field_runs`, `field_parts` |

Field imports nothing from `packages/actions`.

`packages/shared/quest` is separate from the tool and is the estimator Hold's staircase should eventually be measured against. `packages/shared/refresh` is separate because presentation timing is a device property, not a tool property, and anything else that flashes a stimulus will need it.

### 2.3 What it is not allowed to become

Not a vision test. Not a screening instrument of any kind. Not a claim about a player's eyesight. Not a number compared between players or between devices. Not a daily streak. And never described in a way that borrows the driving evidence for a tennis claim.

## 3. Users and entitlements

| Tier | Field |
|---|---|
| Free | Centre and edge, no history beyond the current run |
| Pro | all three modes, hours tracking, full history, the field map |
| Elite | nothing additional |

As with Hold, nothing sits behind Elite. Unlike Hold, that is not because the tool is weak but because hours are the point and a paywall between a player and their hours works against the only thing the evidence supports.

## 4. Session contract

A run is one or more subtests, each a fixed number of trials.

| Mode | Parts | Trials | Duration |
|---|---|---|---|
| Full field | all three | 14 + 24 + 24 | about 4.5 min |
| Centre and edge | subtest two | 24 | about 2 min |
| Clutter | subtest three | 24 | about 2 min |

Full field is the default because it is the reading worth keeping. The shorter modes exist for a player who wants to add hours without a full profile each time.

A run is abandoned cleanly. A partial subtest is not saved, because a threshold from nine trials is not a threshold.

Time on task is recorded on every run and accumulated. That accumulation is the product's primary number, not the threshold.

## 5. Surfaces and states

### 5.1 The three subtests

Faithful to the original three parts.

**Centre.** Identify the central target only. Establishes the floor.

**Centre and edge.** Identify the centre and locate a peripheral target at the same time. This is the divided-attention measure and the one the headline reports.

**Clutter.** The same, with the field full of distractors. Selective attention, and the hardest of the three.

### 5.2 The stage

A square stage with a fixation cross at its centre. The peripheral target appears at one of eight directions and one of three distances from centre, cycled so that each distance receives an equal share of trials.

Eccentricity is reported in screen terms, not degrees, and section 8.5 says why: viewing distance is unknown and cannot be inferred, and a phone at arm's length spans only about 23 degrees in total against the original's 30 degrees from centre in each direction. This tool reaches roughly a third of the original's field. The outer ring, where much of the driving effect sat, is not testable on a phone at all.

### 5.3 A trial

Fixation for 700 ms. The stimulus for a whole number of screen refreshes. Then a noise mask for 300 ms, which is not decoration: without backward masking the afterimage survives the flash and the duration stops meaning anything.

The fixation cross returns and stays up through the response, so the eye has somewhere to be for the next trial.

The central response is a four-way pad of arrow directions. Four alternatives rather than the original's two, for the reason in section 8.4: two leaves too much to luck and costs a third of the precision.

The peripheral response is an eight-way dial with the directions numbered, answerable by tap or by number key.

Feedback names what was missed and the measured flash duration, then moves on.

### 5.4 The summary

The divided-attention threshold, large, in milliseconds, with the sentence that it is the shortest flash the player could still read three times in four with an edge target to place as well.

A figure per subtest run, plus time on task.

**Where the field gives out.** A polar map of three concentric bands shaded by how often the player placed the edge target at that distance, with the percentage on each band. Each band is about eight trials, and the caption says to read the shape rather than the numbers. The map is drawn as annuli rather than stacked discs, so that colour means score and not how many layers of paint a band has under it.

**You hit the screen, not your limit.** Shown only when a threshold lands at or below one and a half screen refreshes. It states the refresh rate, the floor in milliseconds, and that the real threshold is somewhere below it and this run cannot say where.

**Before you read too much into this.** The precision statement, computed from the trial count.

**Hours, not sessions.** What this run added, where the player now stands, and the ten-hour figure.

### 5.5 The hours card

On the tool's own page rather than inside a run. The running total, and the statement that the research attaches to accumulated hours rather than to any one session.

This card is the product. A player who understands it will use Field correctly and a player who does not will treat it like the other four tools, which would be wrong.

### 5.6 What Field does not do

Stated in the product, not only here.

This is the useful field of view task and it has the best transfer evidence in this category, with the meta-analytic figures named.

It was older adults, not young athletes. The transfer was to driving and daily life, not to sport. About half of those trials were run by people with a financial interest in the training being sold.

The original reaches thirty degrees from centre. A phone at arm's length is about twenty-three degrees wide in total, so this reaches roughly a third of that, and the outer ring cannot be tested here at all.

A screen cannot flash anything shorter than one refresh. If a reading lands on that floor it is the screen being measured, not the player, and the summary says so.

Nothing is sent anywhere and nothing here says whether a player is ready to play.

## 6. Functional requirements

FD-1 (Must). The refresh rate is measured at the start of every run from the median of at least 25 frame intervals, and recorded with the run.

FD-2 (Must). Stimulus durations are whole numbers of refreshes. Nothing else can be presented and the tool does not pretend otherwise.

FD-3 (Must). The actual elapsed duration of every flash is measured and used in the threshold estimate, so that a dropped frame is recorded rather than assumed away.

FD-4 (Must). Every stimulus is followed by a backward mask of at least 250 ms covering the whole stage.

FD-5 (Must). The central task has four alternatives.

FD-6 (Must). The peripheral target appears at one of eight directions and three distances, with distances cycled so each receives an equal share of trials within a subtest.

FD-7 (Must). In the clutter subtest, distractors are placed with a minimum separation so that density does not vary by direction. Section 9 states the test.

FD-8 (Must). Distractors never overlap the peripheral target's position and never fall inside the central region.

FD-9 (Must). A trial is correct only when both responses are correct, in the subtests that have two.

FD-10 (Must). Each subtest maintains its own independent threshold estimate with its own guess rate.

FD-11 (Must). The threshold estimator is the Bayesian procedure in section 8.3, not an up-and-down staircase, for the reason recorded there.

FD-12 (Must). A threshold at or below one and a half refreshes is reported as a screen limit rather than as a result.

FD-13 (Must). The summary states the precision of its own figures.

FD-14 (Must). Time on task is recorded per run and accumulated across runs, and the accumulated figure is shown on the tool's own page.

FD-15 (Must). The field map pools trials by distance band. It never shows a per-cell figure, because twenty-four trials over twenty-four cells is one trial a cell.

FD-16 (Must). Under `prefers-reduced-motion: reduce` the mask and the button scaling are unaffected in duration but decorative motion is removed. The stimulus flash is never slowed or lengthened, because its duration is the measurement.

FD-17 (Must). A run abandoned before a subtest completes discards that subtest.

FD-18 (Must). The tool runs entirely on device.

FD-19 (Should). The refresh rate is displayed on the tool's page once measured, so a player knows what floor they are working against.

FD-20 (Should). History flags a run that hit the screen floor, so that a bottomed-out reading is never silently averaged with valid ones.

FD-21 (Could). A high-refresh path that takes advantage of 120 Hz displays to lower the floor, which would make the tool usable for the fastest players.

FD-22 (Won't, Release 1). Any eccentricity reported in degrees, any cross-device comparison, any cross-player comparison, any benchmark tier, any streak, any notification, and any statement borrowing the driving evidence for a tennis claim.

## 7. Data dictionary

`field_runs`

| Field | Type | Notes |
|---|---|---|
| id, player_id | uuid | RLS on player_id |
| started_at, ended_at | timestamptz | |
| mode | enum `full`,`divided`,`clutter` | |
| refresh_hz | smallint | measured, not assumed |
| frame_ms | numeric(4,2) | the floor for this run |
| minutes | numeric(4,2) | time on task |
| headline_ms | smallint | the divided-attention threshold |
| at_floor | boolean | any subtest bottomed out on the screen |
| device | text | |
| created_at | timestamptz | |

`field_parts`

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| run_id | uuid | cascade delete |
| subtest | enum `centre`,`divided`,`clutter` | |
| trials | smallint | |
| threshold_ms | smallint | |
| at_floor | boolean | |
| ring1_n, ring1_ok | smallint | innermost band |
| ring2_n, ring2_ok | smallint | |
| ring3_n, ring3_ok | smallint | outermost reachable band |

Per-trial rows are not stored. The three band tallies carry everything the field map needs and everything a later aggregate could use.

About 400 bytes a run.

## 8. Business rules and formulas

### 8.1 Timing

    frame_ms   = median of at least 25 measured frame intervals, clamped to 4 to 40 ms
    refresh_hz = round(1000 / frame_ms)
    frames(d)  = clamp( round(d / frame_ms), 1, 30 )

The presented duration is always a whole number of frames, and the measured elapsed time of the flash, not the requested time, is what updates the estimate.

### 8.2 The floor

One refresh. About 17 ms at 60 Hz, about 8 ms at 120 Hz.

A threshold at or below 1.5 refreshes is reported as a limit rather than a result. This is not a rare edge case. Young healthy adults can have central thresholds at or below one frame on a 60 Hz screen, so the centre subtest will bottom out for a meaningful share of this product's users. A tool that reported 17 ms in that situation would be reporting the screen.

### 8.3 The threshold estimator

A Bayesian estimate over log duration on a 64-point grid spanning 14 to 560 ms, with a broad log-normal prior centred on 150 ms, an assumed slope of 0.35 in log units, and a per-subtest guess rate. The next trial is placed at the current estimate of the 75 percent point, quantised to frames. The reported figure is the 75 percent duration derived from the posterior mean.

This replaces the obvious choice, and the reason is worth recording. A plain one-up one-down staircase on this task returns between 40 and 90 percent median error at these trial counts, because the duration psychometric function is shallow and the joint guess rate is low, so the staircase wanders and never settles. The Bayesian estimator brings that to about 12 percent at 24 trials. Measured against a synthetic observer, and then confirmed end to end in a browser against a simulated player with a hard 90 ms cutoff, which returned 93 ms and 97 ms on two runs.

The assumed slope is the estimator's main vulnerability. A true slope shallower than assumed costs accuracy; steeper than assumed improves it. The assumption is recorded in `packages/shared/quest` as a constant with this note attached.

### 8.4 Guess rates

Centre alone is a four-alternative choice, so 0.25. The two divided subtests require both responses, so 0.25 × 0.125 = 0.03125.

The central task has four alternatives rather than the original two because two is expensive. At two alternatives the centre subtest returns about 27 percent median error at these trial counts; at four it returns about 17. The divided subtests are unaffected either way, so the change costs nothing and buys a usable subtest one.

### 8.5 Eccentricity

The three bands sit at 42, 71 and 100 percent of the available radius, which is set by the canvas.

They are reported as bands, never in degrees. Viewing distance is unknown and cannot be inferred from anything the browser exposes, and screen size varies. Two players' rings are not the same angular size, and neither are one player's rings on two devices. The field map is therefore meaningful within a player on a device and nowhere else, which constrains any future aggregate severely. That is A43.

### 8.6 Precision

    a 24 trial subtest places the threshold within roughly 12 percent
    a 16 trial subtest within roughly 17 percent

So a change smaller than about 20 percent between runs is noise. The summary states this with the numbers rather than as a caution, and the field map is presented as the steadier output because it pools trials rather than chasing one number.

## 9. Acceptance criteria

AC-1. Refresh measurement returns within 5 percent of the true interval on a 60 Hz and a 120 Hz display.

AC-2. Requested durations are always whole frames, and the measured elapsed flash is within one frame of the request in at least 95 percent of trials.

AC-3. Every stimulus is followed by a mask. A trial that presents without one fails the build.

AC-4. Distractor density is even across the eight directions within 1.5 percentage points of uniform, measured over at least 40 stimuli. Measured on the current implementation: 11.9 to 13.0 percent against a uniform 12.5.

AC-5. Distractors maintain the minimum separation in every generated stimulus, and the full complement places every time.

AC-6. Distance bands receive an equal number of trials within one, across every subtest length.

AC-7. The estimator recovers a known synthetic threshold within 20 percent at the median at 24 trials, across thresholds from 25 to 250 ms, and the browser end-to-end test against a hard-cutoff observer lands within 10 percent.

AC-8. A threshold at or below 1.5 refreshes raises the screen-limit notice, and the notice names the measured refresh rate.

AC-9. The stage and the response dial both fit without clipping at every supported size from 320 by 568 up, including short landscape, where they lay out side by side.

AC-10. The session overlay carries `role="dialog"`, `aria-modal`, a focus trap, Escape handling, focus return on close, and an assertive live region announcing each response prompt and the trial result.

AC-11. Both themes, no horizontal overflow at any width, all controls at least 44 px tall on phones, and the dial's eight targets never overlap.

AC-12. No console error or unhandled rejection across a full Full field run in either theme.

## 10. Notifications produced

None in Release 1. Field does not remind a player to accumulate hours, which would be the obvious mechanic and is exactly the nagging the product refuses elsewhere. The hours card is visible whenever the player opens the tab and that is sufficient.

## 11. Sharing scope and privacy

Field collects no health information and no biometric identifier. It is a reaction and localisation task and it records durations and hit counts.

It is nonetheless the tool in this tab most likely to be mistaken for a clinical measure, because the underlying task appears in the older-driver and cognitive-ageing literature and because "useful field of view" sounds like an optometric term. The product must not present it as an assessment of anything, and the boundary card is written to prevent that reading.

Nothing from Field appears in the coach link by default. A player may opt in to sharing the hours total, which is the least misreadable figure it produces, but not the thresholds or the field map. The `console` database role is denied access to `field_runs` and `field_parts`.

## 12. Analytics events

`field_run_started` with mode and measured refresh rate. `field_run_completed` with mode, minutes, headline threshold, whether it hit the floor. `field_run_abandoned` with subtests completed. `field_hours_milestone` at one, five and ten hours, which is the only place the ten-hour figure is used as a product event.

No event carries a per-trial result or a band tally.

## 13. Implementation plan

### 13.1 Gating

Step 1 is gated on nothing. The estimator and the timing code are already verified numerically and end to end.

The high-refresh path in FD-21 is gated on A42.

Any aggregate reporting is gated on A43.

### 13.2 Build steps

**Step 2.6, Phase 2, epic E23.** Port `packages/shared/quest` and `packages/shared/refresh` with the numerical tests from section 9 written first. Port the stage, mask and response steps. Ship Centre and edge with the threshold, the field map and the hours card.

**Step 3.4, Phase 3.** Full field and Clutter, the screen-limit notice, the per-subtest breakdown, history with the floor flag.

**Step 4.7, Phase 4.** The high-refresh path if A42 is taken, and the hours milestones.

### 13.3 Porting the prototype

The estimator constants, the guess rates, the timing code and the distractor separation rule must survive unchanged. All four were arrived at by measurement and three of them corrected a first implementation that was wrong.

Two things must change. The field map's band colours should come from a named scale rather than three inline thresholds. And the prototype measures refresh once per run at session start; on a device that changes refresh rate dynamically, which some phones do under battery saving, it should re-measure between subtests and record the change.

The dashboard integration is a prototype-only arrangement and should not be carried across. See PRD-16 section 13.3.

## 14. Out of scope and open questions

Out of scope for Release 1: degrees of visual angle, cross-device or cross-player comparison, benchmark tiers, any vision-screening framing, eye tracking, and any use of the UFOV literature's driving outcomes in a tennis claim.

### New rows for the review register

**A41. The ten-hour dose against the rest of the tab.** Decision needed. Every other tool here is built for the twenty minutes before a match and Field is not, and the tab's story has to accommodate that rather than paper over it. This document's position is that Field sits in a separate group, counts hours, and says on its own page that it is not a primer. The alternative, quietly letting players use it as a primer because it is there, is the option that misrepresents the evidence.

**A42. Whether the centre subtest is worth keeping.** Decision needed. On a 60 Hz screen the floor is about 17 ms and young athletes will frequently bottom out on a four-alternative central task, which means subtest one will often report the screen rather than the player. Options: keep it and let the screen-limit notice do its work, drop it and ship two subtests, or make it conditional on a measured refresh above 90 Hz. The third is the most honest and the most work.

**A43. Scores are not comparable across devices.** Decision needed before any aggregate, ladder or team view. The floor moves with refresh rate and the angular size of the bands moves with screen size and viewing distance, neither of which we know. The run records the refresh rate but nothing currently uses it. At minimum, any comparison must be restricted to a single player on a single device; at most, a correction could be attempted for refresh rate but not for viewing distance, which is unknowable.

**A44. Whether the industry-funding caveat belongs in the product.** Decision needed. The boundary card currently states that about half of the trials behind this tool were run by people with a financial interest in the training being sold. It is true, it is material, and it is unusual for a product to say it. The alternative is to state it only in this document and let the product carry the positive figures alone, which would be the normal commercial choice and a less honest one.

**A45. The tier split.** Decision needed. This document assumes Centre and edge free, all modes and hours on Pro, nothing on Elite.

### Placeholders awaiting a number (register section D)

The trial counts of 14, 24 and 24. The fixation of 700 ms and the mask of 300 ms. The grid of 14 to 560 ms over 64 points, the prior centred on 150 ms with a spread of 0.9, the assumed slope of 0.35 and the target of 0.75. The frame clamps of 1 and 30 and the measurement clamp of 4 to 40 ms. The floor multiple of 1.5. The eight directions and the three band radii of 42, 71 and 100 percent. The distractor count of 40 and the separation of 1.05 target widths. The guess rates of 0.25 and 0.03125. The precision figures of 12 and 17 percent and the noise band of 20 percent.

### Open questions

Whether a player who cannot be measured on the centre subtest should be told their result is good news, since bottoming out means they are faster than the screen, or whether that invites exactly the self-congratulation the tool otherwise avoids. Whether the hours total should reset each season, which would make it a commitment figure rather than a lifetime one. Whether the field map should be shown at all after a single run, given that each band rests on about eight trials and the caption already says not to read the numbers. And whether ten hours is a figure this product can honestly ask for from players who have twenty minutes between a practice session and a flight.
