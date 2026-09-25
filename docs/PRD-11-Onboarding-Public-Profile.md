# PRD-11 · Onboarding and Public Profile

Version 0.2 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/onboarding` (the four-step bare shell, `obSteps`, `obName`, `obAtp`, `obLookup`, `obVerified`, `obTarget`, `obBudget`, `plans`, `obPay`, `pickFin`, `pickMind`, `obFinish`), `#/first-week` (the new-player dashboard state), `#/profile` (`ppStatus`, `ppPublish`, `ppBio`, `ppGoal`, the `pub` preview and `pvHead`), and the walkthrough overlay (`const TOUR = […]`) reachable from the topbar tour icon on any route. This is a platform surface rather than an agent, so section 3 below is a system contract: the same seven headings PRD-01 uses for the Tournament Agent, applied to the onboarding flow and the profile-publish flow instead of a scheduled run.

---

## 1. Purpose and job to be done

A player who has just heard about DeuceX from another player in a locker room decides, in about four minutes on a phone, whether this is a tool worth trusting with their ranking, their money and their patrons. Onboarding is the only surface with no sidebar, no agent status cards and no history, so it has to prove three things fast: the ranking is real and verified, not typed in and trusted; the season ahead has been read correctly (tournaments, surfaces, money available); and turning an agent on this minute produces something concrete by Sunday evening, not a vague promise. Everything captured here seeds every other agent: the Tournament Agent's first shortlist, the Financial Agent's first runway number, the Mindset Coach's first check-in.

The public profile is the product's storefront and shares an owner with onboarding, the player alone, with no coach or manager surface: turn a private season into something a stranger, a patron or a sponsor can read and act on in under thirty seconds, without exposing anything the player has not chosen to show.

Job statement, onboarding: "In about four minutes, verify who I am, understand the season I'm about to play, let me pick a plan without a card, and get one agent running today, so that Sunday evening isn't the first time I see what DeuceX actually does." Job statement, public profile: "Give me one page that shows my ranking, my story and my tiers, that I control completely and that updates itself as the season moves, so that a patron or sponsor who finds me mid-season can act on the spot."

Success: at least 80 percent of players who start step 1 reach "Open my dashboard" in one sitting; median time to a live profile is under one day; the walkthrough is completed, not abandoned mid-scrim, at least 70 percent of the time it is shown; profile visits convert to a new patron at a rate the player can see improving week over week.

## 2. Users and entitlements

The player is the only user who acts on this surface; onboarding has no read-only or coach/manager variant. Every new sign-up passes through it regardless of plan: Free, Pro and Elite all run the same four steps, and the plan chosen in step 3 subsequently gates the rest of the app (PRD-00 section 4). A player under 18 by the date of birth entered in step 1 is required by M-ID-3 to supply a guardian email before continuing, with the guardian defaulted as the manager-link recipient and the profile defaulted off; the current build has no such branch (section 12).

The public profile has three audiences who never sign in: the anonymous visitor, the prospective patron, and the sponsor reading the media kit. Entitlement follows PRD-00 section 4: the page, tiers and media kit are available from Free upward; Fan Q&A is shown but disabled with an "Elite" label per M-TIER-1, never hidden outright. Coach and manager share links (PRD-12) are unrelated to the public profile, the only patron- and sponsor-facing surface this document owns.

## 3. System contract

**Trigger.** Onboarding: a new sign-up lands on `#/onboarding` with step 1 active and steps 2 to 4 disabled; a returning player re-enters via the user menu's "Replay setup," reopening step 1 without discarding existing answers. Public profile: reached from the sidebar footer, the user menu, or `#/profile` directly; publishing fires only on the explicit "Publish changes" button, never by navigation or time.

**Inputs.** Onboarding: name, country, date of birth, handedness, photo, an ATP or ITF ID (at least one); ranking target, key tournaments, surfaces, a weekly budget slider (A$400–3,000, A$50 steps), blocked dates; plan and billing cadence; each v1 agent's on/off state. Public profile: headline, bio, goal, slug, five visibility toggles, media-kit narrative fields plus auto-populated ranking/patron figures, and social/contact links.

**Outputs.** Onboarding: a verified (or explicit unverified) player record with a detected stage; a season profile seeding the Tournament Agent's first Sunday run; a no-card Stripe trial on a paid plan; agent schedules matching the toggles; the first-week state (`pc.state = 'first'`) and an automatic first playback of the walkthrough. Public profile: a rebuilt `/p/<slug>` page (toast: "rebuilt (ISR)"), a media-kit PDF, and a rolling 30-day visits/conversions/referral panel.

**Approval gate.** Nothing is charged, published or made public without a deliberate tap. Starting a trial collects no payment method anywhere in the flow ("We'll ask for a card on day 12, on Stripe's page, never here"). Every profile edit updates the live preview instantly but changes nothing public until "Publish changes" is pressed; `#ppStatus` separates the two states ("Live · updated Thu 4 Sep" versus amber "Unpublished changes").

**Failure behaviour.** An ambiguous or failed lookup should let the player continue unverified rather than block the flow (M-ID-2); the build only demonstrates one hard-coded match after a fixed delay, with no such path built (section 12). No answer is persisted before the final step, so a lost session before step 4 loses steps 1 to 3. Publish failures should keep the previous version live with a retry, not a half-published page.

**Audit.** Onboarding records start/finish timestamps, plan and cadence, ranking IDs and verification result, stage and override, and each agent's state at finish. Publishing records the timestamp, changed fields, and the player, device and IP, per M-GATE-4.

**Cost.** UI-only aside from the flat-rate ranking lookup, target under A$0.05 per session; the profile rebuild on publish is a static-render cost, not a per-visit one.

## 4. Surfaces and states

### 4.1 Onboarding shell (`#/onboarding`)

The route renders with no sidebar and no topbar (the `.bare` layout), centred, with the DeuceX logo and the line "Set up in about four minutes." A left rail (`#obSteps`) lists all four steps at all times: the active step is marked "now," completed steps are reachable, and locked steps are disabled buttons showing only their title and a one-line description ("Verified from ATP and ITF," "Goals, surfaces, budget," "Free, Pro or Elite," "Your first shortlist Sunday"). A note under the rail states, "Your email is verified. Everything here can be changed later in Settings; nothing is shown publicly until you build your profile page."

**Step 1, "Who's playing?"** Name (`obName`), country (plain `<select>`, no flags), date of birth, a handedness toggle, a photo with Change/Remove, an ATP ID with "Look up" (`obLookup`), and an ITF ID. Look up shows a spinner and after roughly 900 ms reveals `obVerified`: "ATP #487 · 96 points" ("TDI live feed · updated Mon 7 Sep 02:00 UTC · career high #461") and "ITF #212 · WTN 8.4" ("ITF API · weekly"), each with a Verified badge, plus "Stage 2 · ATP Emerging" ("Detected from your ATP ranking (above ~450). Your ATP number gets the hero spot; ITF shows as a chip; WTN and UTR stay hidden") with an override select. Footer helper text steps through "We'll look up your ranking from the IDs above," "Looking up your ranking…," then "Stage detected. Continue when it looks right."

**Step 2, "What does this season look like?"** Ranking target (`obTarget`, default 400 against current #487) with a live sentence ("From #487. Roughly 30 more points; two Challenger quarter-finals," or "That's at or below where you are. Aim a little higher?"); key tournaments, defaulting to "Challenger Poznań, Challenger Bratislava"; a surfaces toggle group (Clay, Hard, Indoor hard, Grass); a weekly budget slider (`obBudget`, A$400–3,000, A$50 steps, default A$1,200) with a live label and sentence ("At A$1,200 a week, most Challenger 75s in Europe are in reach; two-flight trips and paid coach blocks will be flagged"); and blocked dates, defaulting to "26 Oct – 1 Nov · coach block, Vienna."

**Step 3, "Pick a plan."** A Monthly/Yearly toggle above three plan cards, each a radio with its own feature list; Pro is marked "Stage 1 and 2 players" and pre-selected. Yearly rewrites every price in place (A$49→A$39 Pro, A$149→A$119 Elite), "Yearly · 2 months free." A note reads, "Pro pays for itself if the Financial Agent saves one bad trip a season. Patron payouts are always yours, minus the 8% platform fee. 14 days free, no card needed." The button reads "Start 14-day trial · no card" with "We'll ask for a card on day 12, on Stripe's page, never here."

**Step 4, "Start your first agent."** Four rows (`pickFin`, `pickMind`, Tournament, Content), each with an icon, a tailored description and a switch. Tournament, Content and Financial default on; Mindset defaults off ("Starts after your third Match Scribe note"). A card states the next run and "Nothing is entered without you." "Open my dashboard" (`obFinish`) sets the first-week state, clears the tour flag, routes to `#/`, and starts the walkthrough about half a second later.

### 4.2 First-week dashboard (`#/first-week`)

The state a new player lands in after onboarding, toggled by `pc.state`: the verified ranking chart, a "Your first week" checklist (record a note, log a week of expenses, publish a patron page), sample agent outputs standing in for runs not yet due, and a "See a sample season" link switching to the full populated state (toast: "Showing a sample season · week 37").

### 4.3 Walkthrough tour

Six fixed steps, shown once automatically and replayable from the topbar tour icon (`#tourLink`, tooltip "Take the tour · a 60-second walk through the dashboard"): ranking hero, pulse tiles, decision card, agent status row, the FAB and mobile record tab, and the sidebar/tab bar, titled respectively "Your ranking, verified," "Three questions, every morning," "Entering a tournament is a budget decision," "Agents wait for you," "Capture, from anywhere," "Everything else lives here." Completing it shows "You're set. Your first shortlist arrives Sunday evening." The user menu's "Replay setup" is a separate path back into full onboarding, not a direct tour replay; the tour itself replays only through the topbar icon (section 12).

### 4.4 Public profile editor (`#/profile`)

A visits panel shows 30-day figures ("Visits · 30 days" 1,240, up 38 percent after the Poznań draw; "Became patrons" 3, named; "Found you via" Search 52 percent, the draw page 31 percent, Instagram 17 percent), beside an edit card with four tabs (About, What's shown, Media kit, Links) and a live phone preview of the actual `/p/<slug>` page.

**About** holds the slug (`deucex.ai/p/arya-dubey`), a headline (`#ppHead`), a bio (`#ppBio`) and a season goal (`#ppGoal`), each updating the preview's `#pvHead`, `#pvBio` and `#pvGoal` on every keystroke.

**What's shown** is five toggles (ranking and the 52-week line; next tournament, an accepted entry only; the latest update's teaser; patron tiers; patron names, opt-in per patron), plus a locked Fan Q&A toggle labelled "Elite." A fixed line states what is never shown under any combination: "runway, expenses, Match Scribe transcripts, Mindset insights."

**Media kit** shows following/reach figures from connected accounts and Stripe, a three-line editable story, open sponsor categories (Racquets, Apparel, Nutrition, Travel, Finance), and "Download PDF" producing a one-page kit. **Links** holds Instagram, TikTok, an optional YouTube handle and a sponsor contact email, noting "Patron messages still come through DeuceX, not your inbox."

The preview (`#pub`) renders the hero (photo, name, flag, age, "Challenger circuit," rank badge), headline, a season section with a small trajectory chart, bio, the next-tournament line when set, the latest teaser, three patron tiers with prices, a "Become a patron" call to action, and a socials row. Publishing flips the badge to green "Live · updated just now" with "Published · deucex.ai/p/arya-dubey rebuilt (ISR)."

## 5. Functional requirements

OB-1 (Must). Onboarding renders in the bare shell at `#/onboarding` with no sidebar or topbar; `obSteps` shows exactly four steps, only the active step's fields are editable, and later steps stay disabled until the current one is complete.

OB-2 (Must). Step 1 requires at least one of an ATP, WTA or ITF player ID before "Continue" proceeds (M-ID-2); a tour toggle (ATP, WTA) sits beside the ID field and is confirmed by the lookup result (M-STG-3).

OB-3 (Must). Tapping "Look up" queries the ATP or WTA feed for the chosen tour and the matching ITF ranking (men's or women's) and, on a match, reveals singles, doubles (when ranked) and ITF numbers with source, refresh cadence and a Verified badge per row.

OB-4 (Should). An ambiguous match presents the candidates to choose between; a no-match lookup lets the player continue as explicitly unverified rather than blocking progress (M-ID-2).

OB-5 (Must). A successful verification stores the detected stage per PRD-00 section 3 and displays it with an editable override; changing the override pins the stage until the ranking moves a full stage.

OB-6 (Must). A date of birth under 18 requires a guardian email in step 1 before continuing, defaults the manager link to that guardian, and defaults the public profile to unpublished (M-ID-3).

OB-7 (Must). Step 2 collects ranking target, key tournaments, surfaces, weekly budget and blocked dates, and these seed the Tournament Agent's first scheduled run without further input (PRD-01 section 3).

OB-8 (Must). The ranking-target field recalculates its sentence on every change, stating the point gap and a rough sense of what closing it requires.

OB-9 (Must). The weekly-budget slider updates its value and sentence live as it is dragged, before the step is submitted.

OB-10 (Must). Step 3 presents Free, Pro and Elite with a Monthly/Yearly toggle; switching it updates every displayed price in place without leaving the step.

OB-11 (Must). Starting a paid trial requires no payment method anywhere in onboarding; the trial runs 14 days and the player is told exactly when and where a card will be requested.

OB-12 (Must). Step 4 lets the player enable or disable each of the four v1 agents independently, with Tournament, Content and Financial on and Mindset off by default.

OB-13 (Must). Finishing onboarding sets the first-week dashboard state, routes to `#/`, and begins the walkthrough automatically within roughly one second.

OB-14 (Should). The onboarding note banner states that all answers can be changed later in Settings and nothing is public until the profile is built.

OB-15 (Must). The first-week dashboard shows the verified ranking chart, a three-item checklist, and sample agent outputs, with a link to a fully populated sample season.

OB-16 (Must). The walkthrough runs exactly six fixed steps, shows automatically once per player, and replays at any time from the topbar tour icon regardless of prior views.

OB-17 (Should). The user menu's "Replay setup" re-opens onboarding from step 1 with existing answers preserved, not discarded.

OB-18 (Must). The profile editor shows a live phone preview that updates on every field edit; nothing on the published page changes until "Publish changes" is pressed.

OB-19 (Must). "What's shown" exposes exactly five toggles; runway, expenses, transcripts and Mindset insights are never offered and never appear under any combination.

OB-20 (Must). "Next tournament" shows only an event the player has accepted; a merely shortlisted or undecided event never appears there.

OB-21 (Must). Media-kit ranking and patron-count figures populate automatically from the live feed and Stripe; only narrative fields are player-edited.

OB-22 (Should). Patron tiers on the public page mirror the tiers, prices and descriptions configured in Fans (PRD-04) exactly, with no independent editing surface here.

OB-23 (Must). A player who has not completed ranking verification cannot publish a profile; the publish control is replaced with an explanation and a path back to verification (M-ID-2).

OB-24 (Should). The visits panel shows 30-day visits, named conversions to patron, and referral-source breakdown, refreshed at least daily.

OB-25 (Could). The player can preview the page as a patron, a sponsor or a stranger to confirm what each toggle combination actually hides.

OB-26 (Won't, Release 1). A custom domain or subdomain in place of `deucex.ai/p/<slug>`.

## 6. Data dictionary

Onboarding session record:

| Field | Type | Source | Notes |
|---|---|---|---|
| playerId | string | platform | created on first save of step 1 |
| step | integer 1..4 | onboarding | highest step reached |
| name, country, dob, handed | string, string, date, enum | player | dob drives the guardian branch (OB-6) |
| atpId, itfId | string | player | at least one required |
| verified | enum unverified, verified, ambiguous | ranking feeds | drives OB-3/OB-4 |
| atpRank, atpPoints, itfRank, wtn | integer, integer, integer, decimal | ranking feeds | shown in `obVerified` |
| stage | enum 1, 2, 3 | detection or pin | PRD-00 section 3 |
| stagePinned | boolean | player | set by the override select |
| targetRank, surfaces[], weeklyBudget, blockedDates, keyTournaments[] | integer, array, money, string, array | player | feeds Tournament Agent |
| plan, billingCycle | enum, enum monthly/annual | player | trial starts here |
| agentsEnabled | object {tournament, content, financial, mindset: boolean} | player | step 4 |
| guardianEmail | string, nullable | player | required when under 18 |
| startedAt, finishedAt | timestamp | platform | audit |

Public profile record:

| Field | Type | Source | Notes |
|---|---|---|---|
| slug | string | player | forms `/p/<slug>` |
| headline, bio, goal | string, rich text, string | player | shown verbatim in the preview |
| photo | image reference | player | shared with the sidebar avatar |
| show.rank, show.next, show.teaser, show.tiers, show.names | boolean ×5 | player | the five toggles in OB-19 |
| socials.instagram, socials.tiktok, socials.youtube, contactEmail | string ×4 | player | Links tab |
| kit.following, kit.reach, kit.story, kit.categories[] | string, string, rich text, array | player and platform | ranking/patron figures auto-filled |
| status | enum draft, published | platform | drives `#ppStatus` |
| publishedAt, lastEditedAt | timestamp | platform | audit |
| visits30d, patronConversions30d, referralSources | integer, array, array | platform | visits panel |

## 7. Business rules and formulas

Stage detection reuses the PRD-00 section 3 thresholds: Stage 1 with no ATP ranking or above roughly 800; Stage 2 roughly 450–800; Stage 3 inside roughly 450. A manual override pins the stage until the ranking crosses a full boundary (M-STG-2).

Ranking-target gap sentence: gap = current ranking minus target. At 60 or more, "a Challenger semi and a couple of quarters"; 25–59, "two Challenger quarter-finals"; under 25 but positive, "one good Challenger week"; zero or negative, the copy asks the player to aim higher rather than showing a route.

Weekly-budget tiering: the sentence under the slider is keyed to bands of the value (around A$1,200, "most Challenger 75s in Europe are in reach; two-flight trips and paid coach blocks will be flagged") and recalculates live, not once.

Trial mechanics: 14 days from tapping "Start 14-day trial," card requested on day 12 through Stripe's own page; a lapsed trial reverts to Free at day 14 with the same no-data-loss guarantee as any downgrade (M-TIER-2).

Billing-cycle price swap: Yearly rewrites every price to the annual monthly-equivalent (Pro A$39, Elite A$119); the total annual charge must also be stated as a total at purchase, not only monthly-equivalent, per Australian Consumer Law's no-drip-pricing rule (PRD-00 section 6).

Publish state: dirty the instant a field changes after a publish, live again the instant "Publish changes" succeeds; no partial or scheduled publish in Release 1.

Next-tournament gating: the "Next" section is non-empty only when a shortlisted event's Tournament Agent record is Entered; Skipped, Withdrawn or undecided produces an empty section, never stale data.

## 8. Acceptance criteria

OB-AC-1. Given a new sign-up, when they open `#/onboarding`, then step 1 is active, steps 2 to 4 render as disabled rail entries, and the note banner states nothing is public until the profile is built.

OB-AC-2. Given the player enters ATP ID "B0AH" and taps Look up, when it completes, then the button reads "Found," a toast reads "Found Arya Dubey · ATP #487 · ITF #212," and the block shows "ATP #487 · 96 points" and "ITF #212 · WTN 8.4," each with a Verified badge.

OB-AC-3. Given a verified ranking of ATP #487, when step 1 completes, then "Stage 2 · ATP Emerging" is auto-detected, explained as "Detected from your ATP ranking (above ~450)."

OB-AC-4. Given the ranking-target field is changed from 487 to 550, when it updates, then the description reads "That's at or below where you are. Aim a little higher?" rather than a route to the target.

OB-AC-5. Given the player drags the weekly budget slider to A$1,200, when it settles, then the label reads "A$1,200" and the sentence reads "At A$1,200 a week, most Challenger 75s in Europe are in reach; two-flight trips and paid coach blocks will be flagged."

OB-AC-6. Given step 3 shows Monthly prices, when the toggle switches to Yearly, then Pro changes from A$49 to A$39 and Elite from A$149 to A$119, with no navigation away.

OB-AC-7. Given Pro is selected and "Start 14-day trial · no card" is tapped, when the action fires, then a toast reads "Pro trial started · 14 days, card asked for on day 12," and no card field has appeared anywhere in steps 1 to 4.

OB-AC-8. Given step 4 loads with Mindset off and the rest on, when "Open my dashboard" is tapped, then the app routes to `#/`, the first-week state applies, and the walkthrough begins within about a second.

OB-AC-9. Given the walkthrough was already completed once, when the player clicks the topbar tour icon, then all six steps replay from the beginning regardless of the "seen" state.

OB-AC-10. Given the player edits the bio field on `#/profile`, when they type, then the preview's bio updates on every keystroke and the badge changes from "Live · updated Thu 4 Sep" to amber "Unpublished changes."

OB-AC-11. Given unpublished changes exist, when "Publish changes" is tapped, then the badge returns to green "Live · updated just now" with the toast "Published · deucex.ai/p/arya-dubey rebuilt (ISR)."

OB-AC-12. Given "Patron names" is off, when the page renders, then no first names appear in the tiers section; switched on, it reads "Thanks to Mira, Daniel, Chris, Jonas and 8 more."

OB-AC-13. Given Challenger Poznań is Entered, when "Next tournament" is on, then the preview shows "Challenger Poznań · clay" with the flag and date; while it remains only shortlisted, the section stays empty.

OB-AC-14. Given a 390px viewport, when onboarding step 2 opens, then the surfaces toggle group and budget slider stay fully within the viewport with no horizontal scroll.

## 9. Notifications produced

Onboarding raises no "For you" notification (no decision is pending right after finishing); it produces one FYI on completing the walkthrough ("You're set. Your first shortlist arrives Sunday evening.") and otherwise relies on the Tournament Agent's first-run notification (PRD-01 section 9). First publish of a profile should raise one FYI ("Your public profile is live") with a copy-link action; later republishes do not repeat it.

## 10. Sharing scope

Onboarding data is never shared through the coach or manager links (M-SHARE-1, M-SHARE-2); it is private setup data consumed only by the agents it seeds. The public profile has no access control once published: everything the toggles allow is visible to any visitor, patron or sponsor, by design. The media kit PDF is a manual download the player sends themselves, not distributed through any platform share-link mechanism, and carries no revocation or expiry, unlike the coach and manager links in PRD-12.

## 11. Analytics events

onboarding_started, onboarding_step_completed (step), ranking_lookup_attempted, ranking_verified (atpRank, itfRank), ranking_unverified, stage_detected (stage), stage_overridden (from, to), plan_selected (plan, cycle), trial_started (plan), agent_toggle_changed (agent, on), onboarding_finished (durationSeconds), tour_started, tour_step_viewed (step), tour_completed, tour_replayed, profile_field_edited (field), profile_publish_clicked, profile_published, profile_visit, profile_patron_conversion, media_kit_downloaded. KPIs: step-1-to-4 completion (target 80 percent), median time to first publish (under one day), tour completion (70 percent).

## 12. Out of scope and open questions

Out of scope for Release 1: a full guardian consent workflow beyond an email address; localised onboarding copy beyond English, Chinese and Spanish; A/B testing the four steps; a custom domain; scheduled or partial publishing; a persona-preview mode (OB-25 is Could, not Must).

Open questions: whether onboarding should checkpoint each step to storage, since only the finished state currently persists; what the ranking-target sentence should say for a Stage 1 or Stage 3 player, since the only worked example is Stage 2; whether guardian consent needs a second factor beyond email; whether "Replay setup" should also offer a direct tour replay instead of redoing all four steps.

Inconsistencies found between the prototype and PRD-00, to resolve before build: M-ID-3 requires a guardian email for under-18 players, defaulting the manager link to the guardian and the profile to off; step 1 has a plain date-of-birth field with no such branch, so the requirement is unbuilt. M-ID-2 requires an ambiguous match to offer a choice and an unmatched player to proceed unverified with no profile until verified; the lookup always resolves, after a fixed delay, to one hard-coded match, and the editor has no unverified or locked state, so a never-verified player could still publish. Currency, units, time zone and date format are said to be "meant to come from the country chosen at onboarding," but no wiring exists: the country select has no change handler, and Preferences (PRD-12) always initialises to English, AUD and Metric regardless of country. Finally, PRD-00 names this pair "PRD-11 Onboarding and Public Profile" and "PRD-12 Settings and Sharing," while this brief names PRD-12 "Settings, Preferences and Sharing"; the wording should be reconciled in the next PRD-00 revision.
