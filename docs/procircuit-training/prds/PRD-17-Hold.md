# PRD-17 · Hold

Version 0.1 · 20 September 2026 · Owner: Manu Dubey · Status: draft for review, and see A37 before building · Parent: PRD-00 · Siblings: PRD-06 (Mindset Coach), PRD-14 (Resonance), PRD-15 (Sixteen), PRD-16 (Margin)

Prototype reference: `procircuit-hold.html` v1, and the same tool embedded in the Training tab of `procircuit-dashboard.html`. The prototype holds the tracking volume, the three loads, the adaptive speed staircase, the identification step and the summary with the staircase trace. It is the visual and behavioural reference for this document.

---

## 1. Purpose and job to be done

Eight balls sit in a cube. Four light up, then stop being special, then everything moves for eight seconds. The player has to still know which four they were. Get it right and the next trial is faster; miss it and it slows. After a dozen trials the speed settles at the edge of what the player can hold, and that speed is the score.

This is multiple object tracking, and in three dimensions it is the paradigm behind the commercial trackers a number of professional clubs already own. It is the most recognisable thing in this category and the most engaging of the five tools in the Training tab.

It is also the weakest evidenced, and this document has to be direct about that because the product is.

People reliably improve at 3D-MOT. That part is not in dispute. The claim that improving at it makes an athlete better at their sport is contested, and the reviews that go looking for that transfer tend to find small studies, frequently without an active control group. Our own market scan named this category specifically as having no supported far transfer. Separately, the dose-response work that set the six to ten minute ceiling across this whole tab found that domain-relevant perceptual content outperforms generic cognitive tasks, and abstract spheres in a void is the definition of a generic task.

So Hold ships, if it ships, on a narrower claim than the market usually makes for it. The far-transfer critique is aimed at a training claim: do this for six weeks and your tennis improves. It is not aimed at an acute claim. Positioned in the twenty minutes before a player walks on, the claim becomes that it switches the attention system on, which is a state change rather than a skill change. That claim is far easier to substantiate and it happens to be the gap the market scan identified as unserved.

Job statement: "Switch my attention on before I walk out, and give me one honest number for how sharp it is today."

Success: players who run it before a match run it again; the speed score is never presented as a tennis measurement; and nothing in the product implies a six-week programme.

Section 14 opens with A37, which asks whether this tool should ship at all. That question is genuine and the recommendation there is not a formality.

## 2. Where it lives

### 2.1 Surface placement

PRD-14 established the Training tab inside the Mindset Coach. Hold is a tool in it at `/agent/mindset?tab=training`, and is not a new nav item.

The Training tab groups its tools by when they are meant to be used. Hold sits in **The longer game** group beside Field, not in the Before you play group, and its card carries a one-line statement that people reliably get better at this and whether that reaches their tennis is contested. Putting the caveat on the card rather than only inside the tool is deliberate.

Hold's own column, in order: the load chooser, the settings card, the run history, the timing card, and the boundary card.

Hold contributes nothing to the Mindset Coach's daily insight and produces no pattern. A speed score is not evidence about a player's tennis and should not be written into a coaching surface as though it were.

### 2.2 Code placement

| Path | Holds |
|---|---|
| `apps/web/app/agent/mindset/training/hold/` | route, load chooser, settings, history |
| `packages/ui/hold/` | volume renderer, identification step, summary, trace chart |
| `packages/shared/mot/` | sphere simulation, collisions, layout |
| `packages/shared/staircase/` | the adaptive speed rule and the threshold estimator |
| `apps/api/hold/` | run create, run save, history read |
| `packages/db/` | `tracking_runs` |

Hold imports nothing from `packages/actions`. No model call, no third-party call, no stored media, nothing with an external side effect.

`packages/shared/staircase` is deliberately separate from the tool. It is the same class of machinery Field needs and the two should not each grow their own copy.

### 2.3 What it is not allowed to become

Not brain training, in name or in implication. Not a six-week programme. Not a screening instrument. Not a number compared between players. Not a leaderboard. Not a thing a player is told to do daily. And never a trend line presented as improvement in tennis.

## 3. Users and entitlements

| Tier | Hold |
|---|---|
| Free | Primer load, no history beyond the current run |
| Pro | all three loads, full history |
| Elite | nothing additional |

There is deliberately nothing behind Elite here. A tool with contested transfer evidence should not be a reason to upgrade.

## 4. Session contract

A run is a fixed number of trials. Primer is 12 trials at roughly three and a half minutes, Full read is 20 at about six, Heavy is 16 at about five and a half.

Primer is the default because the dose ceiling for the Before you play window is six to ten minutes in total across all tools, and because a longer run buys precision the product does not need for a state check.

One run. The timing card says so plainly: three runs back to back is how a player arrives tired rather than switched on.

A run abandoned mid-way is discarded. A threshold from five trials is not a threshold.

## 5. Surfaces and states

### 5.1 The load chooser

| Load | Trials | Targets | Balls | Tracking |
|---|---|---|---|---|
| Primer | 12 | 4 | 8 | 8 s |
| Full read | 20 | 4 | 8 | 8 s |
| Heavy | 16 | 5 | 10 | 9 s |

Four of eight for eight seconds is the standard configuration in the literature and the two lighter modes differ only in trial count. Heavy is a different task, not a harder setting of the same one, and section 8.5 states the consequence: its scores are on a different scale and must never be plotted against the others.

### 5.2 The volume

A 2.4 metre cube, centred four metres from the eye. Depth is carried by three cues: size, which changes by a factor of about 1.9 between the near and far faces, mutual occlusion, and aerial shading that fades the far spheres.

A wireframe box is drawn by default and can be turned off. It is a frame of reference for depth and removing it is harder and closer to the original. The camera fit is described in section 8.2 and guarantees the whole volume sits inside the canvas at any shape the box takes.

There is no stereoscopic depth. The original paradigm is viewed through 3D glasses and the two eyes do real work. On a phone they do not, and the boundary card says so.

### 5.3 A trial

Spheres appear still for about a second. The targets light and hold for two seconds, pulsing gently unless reduced motion is on, in which case they are marked statically. Half a second of stillness, then everything moves at the current speed for the tracking duration, bouncing off the walls and off each other.

They stop. Every sphere is numbered and enlarged for tapping. The player selects the targets by tap or by number key. On the last selection the trial is scored: all targets found is correct, anything else is a miss, with the partial count recorded.

Feedback names the result, rings the true targets in the success colour, rings a missed target with a dashed outline and a wrong pick in the danger colour, and moves on.

### 5.4 The speed bar

A live bar showing where the current speed sits in the available range, with the score in the same units the summary reports. A player should be able to see the staircase working on them, because a number that moves for reasons you cannot see is not trusted.

### 5.5 The summary

The threshold speed, large, with the sentence that it is the speed at which they held the targets about half the time.

Three figures: trials fully right, the share of individual balls found, and the number of turning points.

**How it settled.** The staircase trace: speed per trial as a line, each trial marked right or wrong, turning points ringed, and the settled threshold as a dashed line across. This is the signature output and it does more work than the number, because it shows a player whether the run converged or wandered.

**Before you read too much into this.** The precision statement, computed rather than boilerplate: a run of this length places the number within roughly this percentage, so a change smaller than about this much between runs is noise. It also states, without softening, that getting better at this is getting better at this.

### 5.6 History

Last eight runs: load, trial count, the share of balls found, the score and how long ago. A reset returns the list to seeded sample data.

There is no trend chart. This is not an oversight. A rising line invites exactly the reading the boundary card refuses, and section 14 records it as a decision rather than an omission.

### 5.7 What Hold does not do

Stated in the product, not only here, and at more length than in any other tool in this tab.

This is a known task, and the paradigm behind the commercial trackers.

People reliably get better at it. The evidence that getting better at it makes an athlete better at their sport is contested, and the reviews that go looking tend to find small studies without proper control groups.

So it sits here as a primer and nothing else. The claim is that it switches attention on in the minutes before play, not that it changes how a player plays in six weeks. If the speed number climbs, the likeliest explanation is that the player got better at this.

The original is viewed through 3D glasses. A phone is flat.

Nothing is sent anywhere and nothing here says whether a player is ready to play.

## 6. Functional requirements

HD-1 (Must). Spheres are laid out without overlap, with a minimum separation of 2.5 radii, and every sphere is fully inside the volume at the start of a trial.

HD-2 (Must). Targets are chosen by an unbiased shuffle, so that no position or depth is more likely to be a target.

HD-3 (Must). All spheres move at the same speed at all times. Speed is the single controlled variable and collisions must not change it.

HD-4 (Must). Collisions are elastic between equal masses, with speeds renormalised after every resolution step, and overlapping pairs separated so that spheres cannot stick.

HD-5 (Must). Spheres are drawn far to near so that occlusion is correct, and shaded by depth.

HD-6 (Must). Numbers appear on spheres only during the identification step, never during tracking.

HD-7 (Must). Selection is possible by tap and by number key, and a selection can be undone before the final one is made.

HD-8 (Must). No more than the target count can be selected.

HD-9 (Must). The speed staircase uses the accelerated rule in section 8.3: coarse steps until the range is found, fine steps after.

HD-10 (Must). The threshold is the geometric mean of the reversal speeds after the first two, falling back to the last six trial speeds when there are too few reversals.

HD-11 (Must). The summary states the precision of its own threshold and the size of change that counts as noise.

HD-12 (Must). A run may start from the player's last threshold, and whether it did is recorded with the run.

HD-13 (Must). Under `prefers-reduced-motion: reduce` the starting speed is lowered and the target highlight does not pulse. The tracking motion is not slowed further and not removed, because it is the task.

HD-14 (Must). The whole volume projects inside the canvas at every supported width, and sphere diameter at the far face stays above six pixels.

HD-15 (Must). A run abandoned before completion is discarded.

HD-16 (Must). The tool runs entirely on device.

HD-17 (Should). The wireframe box can be turned off, and whether it was on is recorded with the run.

HD-18 (Should). History distinguishes loads clearly enough that a Heavy score is never read as comparable with a Primer one.

HD-19 (Could). A replay of the last trial's paths, which would let a player see where they lost a target.

HD-20 (Won't, Release 1). Any trend chart, any progress claim, any streak, any daily prompt, any notification, any comparison between players, any benchmark tier, and any statement connecting the score to tennis performance.

HD-21 (Won't, Release 1). Identity tracking, where the player must also say which target was which. It is a genuinely different load and belongs as a mode here rather than a separate document, but not in Release 1.

## 7. Data dictionary

`tracking_runs`

| Field | Type | Notes |
|---|---|---|
| id, player_id | uuid | RLS on player_id |
| started_at, ended_at | timestamptz | |
| load | enum `primer`,`full`,`heavy` | |
| targets, balls | smallint | denormalised so a row reads without the enum |
| track_seconds | numeric(3,1) | |
| trials | smallint | |
| full_correct | smallint | trials where every target was found |
| balls_found_pct | smallint | partial credit across the run |
| threshold | numeric(4,2) | metres per second in the virtual volume |
| score | smallint | threshold × 100, the figure shown |
| reversals | smallint | |
| warm_start | boolean | started from the last threshold |
| box_shown | boolean | |
| reduced_motion | boolean | |
| device | text | |
| created_at | timestamptz | |

Per-trial rows are deliberately not stored. The trace chart is drawn from the run in memory and discarded. Storing twenty speeds a run buys nothing the threshold and reversal count do not already carry, and the product has no use for it.

About 200 bytes a run.

## 8. Business rules and formulas

### 8.1 The volume

A cube of side 2.4 m, centre 4.0 m from the eye, spheres of radius 11.5 cm.

The cube is a cube rather than a cuboid for a reason found by measurement: a wider-than-tall volume leaves large dead bands at the top and bottom of a phone-shaped canvas, because the near face is fitted in both directions and the horizontal constraint binds first.

### 8.2 The camera fit

Focal length is the smaller of the two values that fit the near face of the volume horizontally and vertically, with an eight percent margin:

    f = min( 0.92 × (W/2) × near / (Lx/2),  0.92 × (H/2) × near / (Ly/2) )

where `near` is the distance to the near face. This is computed on every resize rather than fixed, so the volume is always fully in frame and sphere sizes scale with the canvas.

### 8.3 The staircase

One up, one down, on a log scale, so it settles where the player is right about half the time.

Coarse factor 1.34 until two reversals have occurred, fine factor 1.12 after. Speed is clamped to between 0.25 and 6.0.

The acceleration is not cosmetic. Against a synthetic observer with a known threshold, a fixed-step staircase starting at 0.9 leaves a fast player, with a true threshold around 3.2, climbing for the whole of a twelve trial run without ever reversing, and the estimate lands about 34 percent off. The accelerated rule brings that to between 8 and 14 percent across the whole plausible range. Warm-starting from the player's last threshold flattens it to about 8 percent at every level.

The practical consequence is that the naive implementation gives the best players the least reliable numbers, which is the wrong way round.

### 8.4 The threshold

    threshold = exp( mean( ln(speed at each reversal after the first two) ) )
    score     = round( threshold × 100 )

With fewer than four reversals, the geometric mean of the last six trial speeds is used instead, and the run is flagged as unsettled.

### 8.5 Comparability

A score is only comparable with another score at the same load. Four of eight and five of ten are different tasks and their thresholds are on different scales. History must make the load unmistakable and any future aggregate must group by it.

The unit is arbitrary. There is no population distribution behind it, which is the reason there is no benchmark tier in this document despite the market scan recommending one for the category. A ladder needs norms and we do not have any. That is A39.

## 9. Acceptance criteria

AC-1. Every trial lays out the full complement of spheres with no overlap, verified over 500 layouts at every load.

AC-2. Targets are distributed evenly across depth and screen position over 2000 trials, within two percentage points of uniform.

AC-3. Sphere speed is identical across all spheres at every simulation step, within floating-point tolerance, including immediately after a collision.

AC-4. The staircase moves up after a correct trial and down after a miss, without exception, across a forced alternating answer pattern.

AC-5. The threshold estimator recovers a known synthetic threshold within 15 percent at the median at 12 trials, and within 10 percent at 20 trials, across thresholds spanning the full clamp range.

AC-6. The whole volume projects inside the canvas at every supported width from 320 px up, with far-face sphere diameter above six pixels.

AC-7. Pressing zero selects the tenth ball at the Heavy load, and selection beyond the target count is refused.

AC-8. The session overlay carries `role="dialog"`, `aria-modal`, a focus trap, Escape handling, focus return on close, and an assertive live region announcing the phase and the trial result.

AC-9. Both themes, 320 px to 1440 px, portrait and landscape, no horizontal overflow, all controls at least 44 px tall on phones.

AC-10. No console error or unhandled rejection across a full run at every load in either theme.

AC-11. No string anywhere in the module asserts or implies a tennis performance benefit. This is a test, not a review note.

## 10. Notifications produced

None, ever. Hold does not notify, remind, congratulate or prompt. There is no streak and no scheduled nudge. A tool with contested transfer evidence has not earned the right to interrupt a player's day, and the product's anti-nagging position applies here with more force than anywhere else in the tab.

## 11. Sharing scope and privacy

Hold collects no health information and no biometric identifier. It records how fast a set of simulated spheres was moving when a player stopped being able to follow four of them.

Nothing from Hold appears in the coach link, and there is no opt-in to add it in Release 1. This differs from Margin, where sharing is off by default but available. The reason is that a Hold score is easy to misread as a statement about a player's ability, and handing a coach a number that means less than it appears to is a harm the product should not create.

The `console` database role is denied access to `tracking_runs`.

## 12. Analytics events

`hold_run_started` with load and whether warm-started. `hold_run_completed` with load, trials, threshold, reversals, whether it settled. `hold_run_abandoned` with trials completed. `hold_setting_changed` with which.

No event carries a per-trial result.

## 13. Implementation plan

### 13.1 Gating

Everything here is gated on A37, which asks whether to build Hold at all. Nothing below should start before that is answered.

If it is answered yes, the work itself is gated on nothing. The simulation and the staircase are already verified numerically.

### 13.2 Build steps

**Step 2.5, Phase 2, epic E22.** Port the simulation and the staircase into `packages/shared`, with the numerical tests from section 9 written first. Port the renderer and the identification step. Ship Primer and Full read with the trace chart and history.

**Step 3.3, Phase 3.** Heavy load, the wireframe toggle, warm start, reduced-motion handling.

Nothing is planned for Phase 4. If Hold has not justified itself by the end of Phase 3 it should be removed rather than extended.

### 13.3 Porting the prototype

The simulation, the camera fit and the staircase constants must survive unchanged; they were arrived at by measurement.

Two things must change. The renderer should use a size observer rather than a window resize listener, for the same framing reason as Margin. And the phase machine in the prototype drives itself from a single animation loop with timers, which is fine for a prototype and should become an explicit state machine so that a mid-trial close cannot leave a timer running.

The dashboard integration is a prototype-only arrangement and should not be carried across. See PRD-16 section 13.3.

## 14. Out of scope and open questions

Out of scope for Release 1: identity tracking, trend reporting, benchmark tiers, any streak or scheduling mechanic, any comparison between players, and any use of the score outside this tool.

### New rows for the review register

**A37. Whether Hold ships at all.** Decision needed, and it should be taken before any engineering time is spent. The case against: it is the weakest evidenced tool in the tab by its own boundary card, it is not tennis-specific, established commercial products already own the category, and the metric it produces measures how good a player has become at Hold. The case for: it is the most engaging of the five, it produces a clean adaptive number, and as an acute primer rather than a training programme the far-transfer critique does not directly apply. The evaluation that accompanied this document recommended cutting it. That recommendation is recorded here rather than buried, and the decision is the product's to make.

**A38. Whether the positioning survives contact with marketing.** Decision needed if A37 is yes. Everything defensible about Hold rests on it being described as an acute primer and never as training. That discipline has to hold in the store listing, the onboarding, the sales deck and any conversation with a club, not only inside the tool. If it cannot be guaranteed, A37 should be answered no, because the version of this tool that overclaims is the version that carries Australian Consumer Law exposure.

**A39. No population norms, therefore no ladder.** Decision needed. The market scan recommended a seasonal benchmark ladder as the retention mechanism for this category, and it is a good mechanism. It needs a population distribution of scores, which we do not have and will not have until enough players have run it. Whether to collect anonymised aggregate scores for that purpose is a privacy decision as much as a product one, and it sits against section 11's position that a Hold score is easy to misread.

**A40. The tier split.** Decision needed. This document assumes Primer free, all loads and history on Pro, nothing on Elite, on the grounds that a contested tool should not be an upgrade reason.

### Placeholders awaiting a number (register section D)

The volume of 2.4 m cubed at 4.0 m, and the sphere radius of 11.5 cm. The minimum layout separation of 2.5 radii. The camera fit margin of 0.92. The staircase factors of 1.34 and 1.12, the switch at two reversals, and the clamps of 0.25 and 6.0. The starting speed of 0.90 and the reduced-motion multiplier of 0.75. The phase durations of 0.9, 2.0, 0.6 and 8 or 9 seconds, and the feedback hold of 1.9 seconds. The trial counts of 12, 20 and 16. The score scaling of 100. The depth shading range of 0.42.

### Open questions

Whether the absence of a trend chart is defensible to a player who can see their scores in the history and will draw the line themselves. Whether Heavy should exist at all, given that it produces an incomparable number and adds a third scale to a tool that already struggles to make one meaningful. Whether the warm start should be the default, since it makes each run faster but also makes consecutive runs less independent than they appear. And whether a tool whose own boundary card argues against reading anything into it can survive a product review on those terms, which is really A37 asked a different way.
