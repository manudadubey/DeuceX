# DeuceX Training tab

Five focus and attention tools for the Mindset Coach, with a product requirements document for each, and Arya's player dashboard with all five wired into it.

Built September 2026. Owner: Manu Dubey.

## Open this first

`prototypes/deucex-dashboard.html`

Arya's dashboard with the Training tab in place. Open it, go to **Mindset Coach** in the sidebar, then the **Training** tab. Every tool opens from there.

One thing to expect: a sixty-second product tour fires about a second after the page loads and returns you to the dashboard. Let it finish or dismiss it, then navigate. This is pre-existing dashboard behaviour, not part of the Training work.

## The five tools

| Tool | What it does | Where it sits |
|---|---|---|
| **Resonance** | Paced breathing at the player's own resonance rate, with camera pulse reading | Before you play |
| **Sixteen** | The four-phase routine between points, and how much shorter it gets after a lost point | Before you play |
| **Margin** | A ball vanishes before it lands and the player calls it. Measures which way they lean | Before you play |
| **Field** | Centre and edge at the same time. The useful field of view task | The longer game |
| **Hold** | Four balls to hold among eight while everything moves | The longer game |

The grouping is deliberate. Resonance, Sixteen and Margin are built for the twenty minutes before a match, with a six to ten minute ceiling across all of them. Field's evidence attaches to accumulated hours rather than to any single session, so it counts hours and says on its own page that it is not a primer. Hold carries a caveat on its card because the evidence that it transfers to sport is contested.

## What is in here

### prototypes/

| File | Notes |
|---|---|
| `deucex-dashboard.html` | Arya's dashboard with the Training tab. Start here |
| `deucex-training.html` | Resonance and Sixteen as a standalone pair |
| `deucex-resonance.html` | Resonance on its own |
| `deucex-margin.html` | Margin on its own |
| `deucex-hold.html` | Hold on its own |
| `deucex-field.html` | Field on its own |

Every file is self-contained. No build step, no server, no network call. Open any of them directly in a browser.

Resonance appears twice, once inside `deucex-training.html` and once on its own. The dashboard embeds the paired file, so the Resonance and Sixteen cards both open it and land on the right tab.

### prds/

| File | Covers |
|---|---|
| `PRD-14-Resonance.md` | Resonance. Register rows A22 to A26 |
| `PRD-15-Sixteen.md` | Sixteen. Register rows A27 to A31 |
| `PRD-16-Margin.md` | Margin. Register rows A32 to A36 |
| `PRD-17-Hold.md` | Hold. Register rows A37 to A40 |
| `PRD-18-Field.md` | Field. Register rows A41 to A45 |

Each follows the house template: fourteen sections, surface and code placement, numbered functional requirements, data dictionary, business rules, acceptance criteria, an implementation plan with gating, and a closing set of register rows, placeholder values and open questions.

## Read these five decisions before building anything

**A32, in PRD-16.** Margin's "your line" metric does not work and must not ship as written. Tested against simulated players with known thresholds, a true line of 30 cm reports as 45 cm, and the Calibrate mode returns roughly 90 cm whatever the truth is. The rule finds the first distance band with enough observations, so it measures where the data is dense rather than where the player stops being sure. The fix is a fitted threshold with a confidence interval. The lean metric is unaffected and validated, so it ships first.

**A37, in PRD-17.** Whether Hold ships at all. The recommendation in the document is to cut it: weakest evidence of the five, not tennis specific, a category established competitors already own, and a score that measures how good the player has become at Hold. The case for keeping it is that it is the most engaging of the five and, as an acute primer rather than a training programme, the transfer critique does not directly apply.

**A41, in PRD-18.** Field needs ten hours before its evidence says anything, and every other tool here is built for twenty minutes. The document's position is to keep Field in a separate group, count hours rather than sessions, and say plainly that it is not a primer.

**A43, in PRD-18.** Field's scores are not comparable across devices. The timing floor moves with screen refresh rate and the size of the field bands moves with screen size and how far away the phone is held, which cannot be known. Any ladder or team view has to be restricted to one player on one device.

**A31, in PRD-15, and it affects Margin too.** Courtside device use during sanctioned matches has not been verified against current ITF, ATP and WTA rulebooks. Until it is, the Match label should mean practice matches, and no tool should encourage courtside use in sanctioned play.

## Notes on the prototypes

**They are wrapped for standalone use.** The published versions are document fragments; these copies carry a doctype, a character set and a viewport tag so that they work when opened straight from this folder, including on a phone.

**Browser storage may not persist.** Each tool saves its history to local storage and falls back to seeded sample data when that is unavailable. Every tool runs correctly either way, you just may not see saved runs persist depending on how the file is opened.

**The dashboard runs each tool in its own frame.** This is a prototype-only arrangement. The five tools share dozens of element identifiers with each other and with the dashboard, and several component class names mean different things in each, so a frame is what keeps them from interfering. In the real build these are components and the problem does not exist. Each PRD says this in its porting section.

**Two tools ask for hardware.** Resonance can read a pulse from the camera and Sixteen can detect ball strikes through the microphone. Both degrade gracefully when permission is refused or unavailable.

**Field measures your screen.** It times its own refresh rate before the first trial and reports the shortest flash that screen can produce. On a 60 Hz display that floor is about 17 ms, and if a reading lands on it the summary says the screen was measured rather than the player.

## What is not here

None of these tools has been tested against anything. The evidence cited in each document is for the underlying paradigm, not for this implementation of it, and each tool says so in its own words on its own page. Nothing in this package should be described as validated.

The pre-Training version of Arya's dashboard is not in this folder. It is in the project as `claude/deucex-dashboard-pre-training.html`.
