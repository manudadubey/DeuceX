# PRD-16 · Margin

Version 0.1 · 20 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00 · Siblings: PRD-06 (Mindset Coach), PRD-14 (Resonance), PRD-15 (Sixteen), PRD-08 (Conditions and Equipment)

Prototype reference: `deucex-margin.html` v1, and the same tool embedded in the Training tab of `deucex-dashboard.html`. The prototype holds the flight model, the three drill modes, the light and speed controls, the call pad, the per-ball feedback and the set summary with the lean split and the band chart. It is the visual and behavioural reference for this document.

---

## 1. Purpose and job to be done

Every player has a line. Somewhere between the ball that is obviously in and the ball that is obviously gone there is a band where they are guessing, and inside that band they do not guess evenly. They lean. Some play on balls that were already out. Most do the opposite: they call good balls out and stop playing.

The Wimbledon line-calling work put a number on that lean in professional tennis. When players called a close ball wrongly, the error was an in ball called out roughly five times out of six. The mechanism is perceptual rather than temperamental, an artefact of how the visual system extrapolates a moving object, which means it is measurable and probably stable within a player.

Nobody has ever measured it for an individual. A coach cannot see it, because to see it they would have to know what the player believed about a ball that a machine called correctly, on a court where no machine is watching. Margin measures it directly: a ball flies, it disappears before it lands, the player calls it, and over a set of balls the tool reports the split of their wrong calls.

The drill itself sits on the strongest evidence in this tab. Temporal occlusion, cutting the picture off and making the athlete predict what happens next, returns an anticipation effect of about d = 1.21 in meta-analysis, with roughly d = 0.85 transferring to the field and no significant difference between screen-based and on-court training. That last finding is what makes a phone version defensible: a screen is not a proxy for the studied intervention, it is the studied intervention.

The honest limit, stated in section 5.8 and in the product itself, is that this literature is mostly about reading an opponent's body before contact. Reading the flight of the ball after contact is a near neighbour, not the same thing.

Job statement: "Sharpen my read of a ball I have to judge in a fraction of a second, and tell me which way I lean when I cannot."

Success: at least half of Pro players who complete one set complete a second within two weeks; a player's lean is reported with enough wrong calls to be meaningful in more than 90 percent of Sharpen sets; the accuracy figure is never presented as a performance prediction.

## 2. Where it lives

### 2.1 Surface placement

PRD-14 established the Training tab inside the Mindset Coach. Margin is the third tool in it, at `/agent/mindset?tab=training`, and is not a new nav item.

The Training tab groups its tools by when they are meant to be used. Margin sits in the **Before you play** group beside Resonance and Sixteen, as a card carrying the player's current line and lean, opening into the tool full-screen.

Margin's own column, in order: the mode chooser, the court settings card, the session history, the timing card, and the boundary card.

The quick-actions sheet gains one item, **Call some balls**, which opens Margin in the Sharpen mode. The Mindset Coach daily insight may reference a lean once it is stable across sets, using the same three-set rule the routine pattern uses in PRD-15, and never on a single set.

### 2.2 Code placement

| Path | Holds |
|---|---|
| `apps/web/app/agent/mindset/training/margin/` | route, mode chooser, settings, history |
| `packages/ui/margin/` | court renderer, call pad, summary, band chart |
| `packages/shared/ballflight/` | the flight model, the shot solver, the camera fit |
| `packages/shared/margin-stats/` | banding, threshold fit, lean split |
| `apps/api/margin/` | set create, set save, history read |
| `packages/db/` | `margin_sets`, `margin_balls` |

Margin imports nothing from `packages/actions`. It has no external side effect: no payment, no mail, no third-party call, no model call, and nothing that costs a cent per session.

The flight model and the camera fit belong in `packages/shared` rather than in the UI package because they are the part that must be identical between the web build and the Capacitor shells, and because they are the part worth testing numerically rather than visually.

### 2.3 What it is not allowed to become

Not a line-calling aid. Not a claim about a player's eyesight. Not a screening tool of any kind. Not a ranking of players against each other. Not a replacement for on-court reps, and never described in a way that implies it is.

## 3. Users and entitlements

| Tier | Margin |
|---|---|
| Free | Calibrate mode, no history beyond the current set |
| Pro | all three modes, full history, lean and line reported |
| Elite | conditions linking per section 8.6, threshold control |

Coaches on a share link see whatever the player's sharing scope allows, which by default is nothing from Margin. See section 11.

## 4. Session contract

A set is a fixed number of balls, not a clock. Calibrate is 12 balls at roughly 90 seconds, Sharpen is 20 balls at roughly two minutes, Edge is 16 balls at roughly 100 seconds.

The dose ceiling applies to Margin the way it applies to every tool in the Before you play group: six to ten minutes total, which is two or three sets and not more, finishing twenty to thirty minutes before the first ball, with the last ten minutes before walking on kept screen free. The tool states this in the timing card and does not enforce it, because a tool that locks a player out on the morning of a match is worse than one that trusts them.

A set is abandoned cleanly. Closing mid-set discards it rather than saving a partial, because a threshold fitted to seven balls is worse than no threshold.

## 5. Surfaces and states

### 5.1 The mode chooser

Three modes, differing only in ball count, how early the ball is cut, and how tightly the landing points cluster around the line.

| Mode | Balls | Cut before bounce | Spread about the line |
|---|---|---|---|
| Calibrate | 12 | 300 ms | wide, to about 1.2 m |
| Sharpen | 20 | 220 ms | narrow, to about 0.55 m |
| Edge | 16 | 150 ms | very narrow, to about 0.32 m |

Sharpen is the default and the one the timing card recommends before a match. Calibrate exists to place a player's line with a wide enough range of margins to fit it. Edge is deliberately close to impossible and is labelled as such.

### 5.2 The court

The view is a camera behind and above the baseline, not the player's own eye position. This is a constraint rather than a preference and section 8.2 gives the geometry: from where a receiver actually stands, their own baseline sits about two and a half screen heights below the frame on a phone, so it cannot be drawn. The tool says so in the boundary card rather than letting a player assume the view is theirs.

Two settings change difficulty and both are real playing conditions.

**Light.** Sun casts a ball shadow, which is a strong and genuine depth cue and is what a player uses outdoors. Overcast removes it and is materially harder, and is what indoor tennis looks like.

**Speed.** Full, 0.8 and 0.6. Slower is a legitimate way in for a player new to the drill and is also the honest accommodation under `prefers-reduced-motion`, where it is selected by default. The ball's flight is the content of this drill, so there is no still variant to offer and the tool does not pretend otherwise.

A third control, **draw the ball at its true size**, is off by default. At the framing the court requires, a real tennis ball is about three pixels across at the moment it vanishes, which is unusable. The default draws it larger and the setting says exactly that.

### 5.3 A ball

Fixation is a two-count, then the ball leaves the far baseline and flies. At the cut point the ball and its shadow both disappear together, the call buttons arm, and the cue reads "Call it". Nothing about the arming is a surprise: the buttons are on screen the whole time, disabled until the cut, so there is no visual search at the moment of response.

The player calls IN or OUT by tap, or with I and O, or with the left and right arrows. Response latency is recorded from the cut.

### 5.4 Feedback

Immediately on the call: the remainder of the flight is drawn as a dashed ghost from the cut point, the bounce is marked, and the verdict reads "Yes · In by 24 cm" or "No · Out by 11 cm". The mark is drawn in the chart palette when the ball landed in and in the danger colour when it landed out. The verdict holds for about 1.5 seconds and the next ball begins.

The player is told the margin in centimetres every time. This is deliberate. A player who is wrong by four centimetres and a player who is wrong by forty have made different mistakes and the drill should not flatten them into one red dot.

### 5.5 The set summary

Accuracy as a ring and a percentage, the count right, and median decision time.

Three figures: the line, the number of balls that landed within 30 cm, and decision time.

**Where you stop being sure.** A bar per 15 cm band showing accuracy by distance from the line, with the count above each bar. Bands holding fewer than three balls are drawn faint and the legend says not to read them, because at twenty balls over six bands most bands are noise.

**Which way you lean.** Only when there are at least three wrong calls. A two-sided bar splitting the wrong calls into good balls called out and gone balls played on, with the Wimbledon figure alongside for context. This is the headline of the product and section 8.5 gives the formula.

**Before you read too much into this.** The sample-size caveat, stated with numbers rather than as a disclaimer.

Then Save the set, or Go again, with a practice label.

### 5.6 History

Last eight sets: mode and ball count, light condition, lean direction, line, accuracy and how long ago. A reset returns the list to the seeded sample data, which exists so that a first-time player sees a populated screen rather than an empty one.

### 5.7 The lean pattern

Margin contributes one pattern kind to the Mindset Coach's existing `patterns` table, `kind = 'call_bias'`, under the same rules PRD-06 sets: a minimum of three sets, a stated magnitude, a confidence, and the ability to dismiss it. It reads in the Coach's voice, for example "Across your last four sets, four out of five of your wrong calls were good balls you called out."

It is never generated from a single set and never phrased as advice about whether to play a ball.

### 5.8 What Margin does not do

Stated in the product, not only here.

It does not claim to make a player win more. The occlusion evidence is good and this particular drill on a phone has not been tested against anything.

That evidence is mostly about reading an opponent's body before they hit, not the flight of the ball after they hit.

A screen has one eye, not two, so the depth cue used here is not the depth cue used on court, and the whole court is compressed into a far smaller visual angle than it occupies in front of a player.

The camera is not where the player stands, for the reason in section 8.2.

Calls stay on the phone. No score goes anywhere, and nothing here says whether a player is ready to play.

## 6. Functional requirements

MG-1 (Must). Every ball is generated by the flight model in section 8.1, solved to a target landing depth and lateral position, and rendered from a precomputed path so that frame rate never changes the trajectory.

MG-2 (Must). The ball and its shadow are occluded at the same instant. Nothing about the shadow survives the cut.

MG-3 (Must). The cut point is defined as a time before the bounce, not a position, and is fixed per mode.

MG-4 (Must). Landing depth is the only judged variable. Lateral position varies for realism and is constrained to the visible width at the near baseline.

MG-5 (Must). The call buttons are visible from the start of the flight and disabled until the cut, so that response requires no visual search and cannot be pre-empted.

MG-6 (Must). Response latency is recorded from the cut to the call for every ball.

MG-7 (Must). Per-ball feedback states the true margin in centimetres and whether the call was right.

MG-8 (Must). A set's shots are generated from a seed recorded with the set, so that a set can be reproduced exactly for support or review.

MG-9 (Must). No visible property of the flight before the cut may correlate usefully with the answer. Section 9 states the test that enforces this.

MG-10 (Must). The lean split is computed only when at least three calls were wrong, and is otherwise suppressed rather than shown as zero.

MG-11 (Must). Accuracy bands holding fewer than three balls are visually de-emphasised and excluded from any fitted threshold.

MG-12 (Must). The summary states the precision of its own figures in the same units the figures use.

MG-13 (Must). Under `prefers-reduced-motion: reduce` the speed control defaults to 0.6 and all chrome transitions are reduced to opacity and colour only. The ball is not slowed further and not removed.

MG-14 (Must). The ball is drawn above true angular size by default, and the control that returns it to true size states the consequence.

MG-15 (Must). The drill runs entirely on device. No frame, image or trajectory leaves the phone.

MG-16 (Must). A set closed before completion is discarded, not saved partially.

MG-17 (Must). The court renders correctly in both themes and at every supported width, with the whole judged region of the near baseline inside the frame.

MG-18 (Should). Light and speed are remembered between sets.

MG-19 (Should). A set can be labelled as practice at save time. Match labelling is withheld pending A31.

MG-20 (Should). History shows the light condition, because a run of overcast sets is not comparable with a run of sunny ones.

MG-21 (Should, Elite). Conditions from PRD-08 for an upcoming tournament may set the light condition and, once modelled, the ball type and altitude, so that the drill matches the week ahead.

MG-22 (Could). A left and right variant that judges the sideline rather than the baseline, which would let the drill address lateral bias.

MG-23 (Could). A coach-visible summary, gated on the sharing decision in section 11.

MG-24 (Won't, Release 1). Any use during a live point, any overlay on real video, any claim of improved line calling, any comparison against other players, and any form of vision screening.

MG-25 (Won't, Release 1). Storage of the rendered court, the trajectory series, or any media artefact. Only the per-ball scalars in section 7 persist.

## 7. Data dictionary

`margin_sets`

| Field | Type | Notes |
|---|---|---|
| id, player_id | uuid | RLS on player_id |
| started_at, ended_at | timestamptz | |
| mode | enum `calibrate`,`sharpen`,`edge` | |
| context | enum `practice` | match withheld pending A31 |
| light | enum `sun`,`flat` | |
| speed | numeric(2,1) | 1.0, 0.8 or 0.6 |
| true_size | boolean | ball drawn at true angular size |
| balls | smallint | |
| correct | smallint | |
| accuracy_pct | smallint | |
| line_cm | smallint, nullable | fitted threshold, null when not estimable |
| line_method | enum `band`,`fit` | per A32 |
| false_out | smallint | good balls called out |
| false_in | smallint | gone balls played on |
| lean_pct | smallint, nullable | false_out as a share of wrong calls |
| median_rt_ms | smallint | |
| seed | bigint | regenerates the exact set |
| device | text | |
| linked_note_id | uuid, nullable | set by the overnight job |
| tournament_id | uuid, nullable | |
| created_at | timestamptz | |

`margin_balls`

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| set_id | uuid | cascade delete |
| seq | smallint | |
| margin_cm | smallint | positive is inside the baseline, negative is past it |
| lateral_cm | smallint | from the centre mark |
| archetype | enum `loopy`,`rally`,`flat`,`slice` | |
| cut_ms | smallint | time before bounce at occlusion |
| called_in | boolean | |
| correct | boolean | |
| rt_ms | smallint | |

About 1.2 KB a set. No media, no trajectory arrays, nothing that needs an object store. The trajectory is reproducible from `seed` and the model constants, which is why it is not stored.

## 8. Business rules and formulas

### 8.1 The flight model

Drag and Magnus, integrated at 1 ms, with the constants frozen in `packages/shared/ballflight`: mass 57 g, radius 33.5 mm, air density 1.21 kg/m³, drag coefficient 0.55, lift coefficient capped at 0.33 and taken as 0.6 times the spin parameter.

The model is calibrated against real tennis and the acceptance test in section 9 holds it there. A rally topspin ball leaves at about 110 km/h, crosses the net about 2.3 m above the ground, lands roughly a metre inside the baseline about one second later, and arrives at about 70 km/h.

Four archetypes, drawn evenly: loopy topspin, rally topspin, flat drive and slice, each with its own launch angle, spin and contact height.

### 8.2 The camera

Fixed at 6.5 m behind the near baseline, 2.10 m high, pitched 12 degrees down, with a 34 degree horizontal field. The focal length is derived from the canvas width, not its height, and the vertical centre is chosen so that the near baseline always sits at 74 percent of the canvas height regardless of the box shape.

This position is a consequence, not a preference. A parameter search over the plausible range found that the true receiving position, about 1.2 m behind the baseline at eye height, puts the near baseline at roughly two and a half screen heights on a phone, and that every camera close enough to feel first-person pushes the far baseline off the top of the frame and leaves the ball visible for under a fifth of its flight. The chosen camera keeps the ball in frame for the whole flight and the whole volume inside the canvas.

The scene is naturally wide and shallow, about 14 degrees between the two baselines vertically against nearly 50 degrees across the near court, which is why the court box is close to 4:3 and why a tall box produces a telephoto view with the sidelines off screen.

### 8.3 Ball size

True angular size at this framing is about 3.4 px in diameter at the cut and about 5.6 px at the bounce, which is not usable. The default multiplier is 2.2. This is a product decision with claim consequences, not a rendering detail, and it is stated in the interface.

### 8.4 The line

The distance from the baseline at which the player is right about three times in four.

The prototype estimates it by scanning 15 cm bands for the first band with at least four balls and at least 75 percent accuracy. **This method is wrong and must not ship.** Section 9 records the test that establishes it: against a simulated player with a known line of 30 cm, Sharpen reports a median of 45 cm, and Calibrate reports about 90 cm whatever the truth is, because the rule finds the first band with enough data and outer bands fill first. It is measuring where the data is dense.

The replacement is a fitted psychometric function over absolute margin, reported with its confidence interval, suppressed when the interval is wider than the estimate. This is A32 and it is a build blocker for the metric, not for the tool: the lean split is unaffected and can ship first.

### 8.5 The lean

Of the calls that were wrong, the share that were good balls called out.

    lean_pct = false_out / (false_out + false_in) × 100

Reported only when `false_out + false_in >= 3`. Against a simulated player with a known tendency this recovers the truth closely: a 50 percent lean reports 50, a 70 percent lean reports 71, an 85 percent lean reports 86, and there are enough wrong calls to compute it in about 99 percent of twenty-ball sets. The spread on a single set is wide, about plus or minus 25 points at the tenth and ninetieth percentiles, which is why the pattern in section 5.7 requires three sets.

### 8.6 Margin generation

Absolute margin is drawn as `spread × u^bias` with u uniform, which concentrates balls near the line, and the side is drawn evenly. Lateral position is uniform within plus or minus 1.7 m, inside the visible half-width of about 2.1 m at the near baseline.

Balls are solved to their target by alternating bisection on lateral angle and launch speed, three rounds, because the two interact: a lateral angle of several degrees reduces the depth component enough to move the landing point by tens of centimetres if solved independently.

## 9. Acceptance criteria

AC-1. The flight model reproduces the reference values in section 8.1 within five percent for each of the four archetypes.

AC-2. **No pre-cut giveaway.** Across a 1.6 m spread of landing depth on a fixed archetype, net-crossing height varies by no more than 20 cm and flight time by no more than 40 ms. Measured on the current model: 14 cm and 26 ms. A change to the model that breaks this invalidates the drill and must fail the build.

AC-3. A simulated player answering at chance scores between 45 and 55 percent over 500 sets.

AC-4. A simulated player with a known lean of 50, 70 and 85 percent is reported within 5 points of the truth at the median over 1000 sets.

AC-5. The fitted line recovers a known threshold of 15 cm and 30 cm within 20 percent at the median in Sharpen, and reports no line rather than a wrong one when the fit is unstable. The current band method fails this and is the subject of A32.

AC-6. Every corner of the judged region of the near baseline, and every bounce mark at the maximum lateral offset, projects inside the canvas at every supported width from 320 px up.

AC-7. The ball is in frame for at least 90 percent of its flight at every supported width.

AC-8. The session overlay carries `role="dialog"`, `aria-modal`, a focus trap, Escape handling, focus return on close, and a polite live region announcing the call prompt and the verdict.

AC-9. Both themes, 320 px to 1440 px, portrait and landscape, no horizontal overflow, all controls at least 44 px tall on phones.

AC-10. A set generated from a recorded seed reproduces ball for ball.

AC-11. No console error or unhandled rejection across a full set in either theme.

## 10. Notifications produced

None in Release 1. Margin does not notify, nag, remind or congratulate. A lean that becomes stable may surface inside the Mindset Coach's daily insight, which is a surface the player already opens, and that is the only way Margin speaks outside its own tab.

## 11. Sharing scope and privacy

Margin collects no health information and no biometric identifier. It records what a player believed about a simulated ball. This is a deliberate contrast with Resonance, and it means M-PRIV-4 does not apply here.

It is still not shared by default. A call bias is the kind of thing a player may not want a coach to see before they have decided what they think about it, and the product's position throughout is that the player decides what leaves their phone.

Default scope: nothing from Margin appears in the coach link. A player may opt in to sharing the set history and the lean. The `console` database role is denied access to `margin_sets` and `margin_balls`, consistent with the treatment of notes, moods and breathing sessions.

The privacy card in the tool states that calls stay on the phone, and that must remain structurally true: a test should fail if any upload path appears in the Margin module.

## 12. Analytics events

`margin_set_started` with mode, light, speed. `margin_set_completed` with balls, accuracy, whether a line was estimable, whether a lean was reported. `margin_set_abandoned` with balls completed. `margin_setting_changed` with which. `margin_pattern_shown` and `margin_pattern_dismissed`.

No event carries a per-ball margin or a call. The unit of analytics is the set.

## 13. Implementation plan

### 13.1 Gating

Step 1 is gated on nothing and can start immediately. The flight model and camera fit are already verified numerically and are the lowest-risk part of the work.

The line metric is gated on A32. The lean metric is not, which is the right order: the headline ships first.

Conditions linking is gated on PRD-08 modelling ball type and altitude in the flight model, which it does not yet.

### 13.2 Build steps

**Step 1.6, Phase 1, epic E21.** Port the flight model, the shot solver and the camera fit into `packages/shared/ballflight` with the numerical tests from section 9 as the first thing written. Port the renderer. Ship Calibrate and Sharpen with accuracy, the lean split and history. The line is shown as "not yet" until A32 lands.

**Step 2.4, Phase 2.** Edge mode, the band chart, the light and speed settings, reduced-motion handling, the true-size control.

**Step 3.2, Phase 3.** The fitted line per A32, the lean pattern into the Mindset Coach's `patterns` table, the quick action.

**Step 4.6, Phase 4.** Conditions linking from PRD-08, Elite threshold control, and the sideline variant if MG-22 is taken.

### 13.3 Porting the prototype

The prototype is a single file with a hand-rolled projection and a canvas renderer. Three things must survive the port unchanged because they were arrived at by measurement rather than taste: the model constants, the camera parameters, and the seeded generator.

Three things must change. The line metric, per A32. The renderer should move to a size-observer rather than a window resize listener, because in the dashboard it lives in a frame that can resize without the window doing so. And the drill currently assumes it owns the whole viewport, which is true full-screen and not true if it is ever embedded inline.

The dashboard integration in `deucex-dashboard.html` is a prototype-only arrangement: each tool runs in its own frame because the five tools share dozens of element identifiers with each other and with the dashboard. In the real build these are components and the problem does not exist, so the frame approach should not be carried across.

## 14. Out of scope and open questions

Out of scope for Release 1: sideline judgement, serve calls, any reading of an opponent's body, any use of real match video, rally simulation, scoring, and any multiplayer or comparative dimension.

### New rows for the review register

**A32. The line metric is wrong and needs replacing.** Decision needed, and it is not really a decision so much as a defect with a chosen fix. The band-scan method in the prototype systematically overestimates and in Calibrate returns roughly the same answer whatever the player's true threshold, because it selects the first band with enough observations rather than fitting anything. Verified against simulated players with known thresholds of 15 cm and 30 cm. The proposal is a fitted psychometric function over absolute margin with a reported confidence interval, and suppression when the interval is too wide to mean anything. Until it lands, the figure should not be displayed at all rather than displayed wrongly.

**A33. The default ball size.** Decision needed. True angular size at the required framing is about three pixels at the cut, which cannot be used, so the prototype draws the ball 2.2 times larger. That multiplier changes the difficulty of the task and therefore every number the tool reports, so it must be frozen before any player accumulates history, recorded on each set, and stated wherever a claim is made.

**A34. Whether the camera compromise should be stated in the marketing as well as the product.** Decision needed. The tool tells the player that the view is not their eye position and why. Whether that honesty survives into how the feature is described externally is a separate decision and it should be made deliberately rather than by omission.

**A35. The tier split.** Decision needed. This document assumes Calibrate free, all modes and history on Pro, conditions linking and threshold control on Elite.

**A36. Whether a lean is ever actionable.** Decision needed, and it is the most interesting question in this document. Measuring a call bias is straightforward. Telling a player what to do about it is not, and a naive instruction to trust close balls more could cost them points. Until there is something honest to say, the pattern should describe and not advise.

### Placeholders awaiting a number (register section D)

The three cut points of 300, 220 and 150 ms. The three spreads of 1.20, 0.55 and 0.32 m and the concentration exponents 1.35, 1.60 and 1.70. The ball size multiplier of 2.2 and the minimum rendered radius of 1.6 px. The camera at 6.5 m, 2.10 m, 12 degrees, 34 degrees and the near-baseline anchor of 0.74. The lateral limit of 1.7 m. The band width of 15 cm, the minimum of four balls to set a line and three to draw a band. The minimum of three wrong calls before a lean is reported. The model constants in section 8.1.

### Open questions

Whether Calibrate should exist at all once the line is fitted rather than scanned, since a fitted threshold needs a wide spread of margins and Sharpen could simply include a few wide balls. Whether the drill should ever show a player their own trend, given that occlusion training improves the trained task quickly and a rising accuracy line invites exactly the far-transfer reading the boundary card refuses. Whether the shadow should be a setting at all or should follow the conditions brief automatically for players who have one. And whether a set should be allowed at all inside the last ten minutes before a match, which the timing card advises against and the product currently permits.
