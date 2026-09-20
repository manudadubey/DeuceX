# PRD-09 · Sponsor Agent

Version 0.1 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Parent: PRD-00

Prototype reference: `#/agent/sponsor` (pipeline board, Wilson EU outreach draft, kit compliance, deal benchmark table), the Media kit tab on `#/profile`, the Sponsor row in Settings > Agents, the locked Sponsor sidebar item, and the Elite plan note on onboarding. Patron and payout mechanics are PRD-04; the media kit's own editing surface is PRD-11 and only its sponsorship-facing fields are fixed here.

---

## 1. Purpose and job to be done

A player ranked in the #150 to #1500 band who has no agent and no manager runs sponsorship the way she runs everything else: alone, between matches, from a hotel room. Arya has one signed placement with a local racquet and grip shop, a handful of maybes in a notes app, and no reliable way to know whether an offer made to her is fair for someone at her ranking. Brands rarely chase players outside the top hundred; the players who get sponsored below that line are the ones who ask, in writing, with a media kit that looks the part. The Sponsor Agent is the staff she doesn't have: it researches brands that plausibly fit her sport, nationality and open categories, drafts the first email in her voice from the media kit and the result she just posted, keeps a running pipeline so nothing goes cold, checks whatever she wears on court against the rules before a logo becomes a code violation, and tells her, in figures drawn from other players at her ranking band, what a deal like hers is worth. It never sends, never agrees a term and never invents a number about her season; it proposes, she taps.

Job statement: "Find the brands that would plausibly say yes to someone ranked where I am, write the email I'd write with an afternoon and a marketing degree, keep my kit legal before it becomes a fine, and tell me what a deal like mine is actually worth, so the one hour a week I can give sponsorship goes to the brands worth it."

Success: at least one drafted outreach a week reaches an approved brand; every Signed or In talks placement passes kit compliance before the player's next entered tournament; she never learns of a compliance problem from an umpire instead of from the app; no benchmark figure is later found to overstate what she actually earned.

## 2. Users and entitlements

Player on Elite: full agent, a live pipeline built from the player's own media kit and results, real outreach drafts, kit compliance checked against her own signed contracts, benchmark figures for her ranking band, an "Early access" badge and a feedback link in the header (M-TIER-4). Player on Pro: the same page renders with a sample pipeline, draft and benchmark table under the studio-bar banner "This is a preview. The pipeline, drafts and benchmarks below are examples." (`#/agent/sponsor`); the actions are "Upgrade to Elite" and "Finish your media kit first", the latter routing to `#/profile` so she is never asked to pay before the media kit the agent depends on exists. Player on Free: the Sponsor Agent is not part of the plan (PRD-00 section 4); there is nothing free to preview, so the surface is absent rather than shown locked.

Coach via share link: nothing from this surface (M-SHARE-1). Manager via share link: the cash value of a Signed placement as an income line once recorded (PRD-03), never the pipeline, drafts or benchmark table (M-SHARE-2). Sponsors are not app users; they receive the outreach email and media kit PDF as external documents.

Under-18 players (M-ID-3): a Signed placement appears on the guardian's manager link once realised as income; the agent otherwise behaves identically.

## 3. Agent contract

Trigger. A scheduled weekly review every Monday that rescans candidate brands, refreshes each Fit score, and prepares the next outreach step needed: a first email for a greenlit Researching brand, or a follow-up for a Contacted brand with no reply after seven days (Wilson EU: sent Tuesday 9 September, opened twice, follow-up drafted for Tuesday 16 September). The review also runs whenever the player edits the media kit in `#/profile`, since Fit scores read those fields directly, and whenever a new contract is uploaded. The prototype shows no on-demand "review now" control; Release 2 should add one for parity with the Tournament and Content Agents (section 12).

Inputs. The media kit (following, reach, story, open categories); verified ranking, stage and ranking band; confirmed results only, never one the player has not confirmed; ATP and ITF kit and logo-size rules by tier; existing signed contracts (brand, category, term, placements, expiry); a candidate brand's public category and existing tennis sponsorships; anonymised historical placement figures for the ranking band.

Outputs. A pipeline of brand cards across Researching, Contacted, In talks, Signed and Declined, each with a category tag, a fit rationale and a Fit score out of 100; one outreach draft per contact step due; a kit compliance list per Signed or In talks placement, pass or warn with a reason; the deal benchmark table by category; a media kit refresh whenever inputs change. One FYI notification per run with no urgent action, or one For-you notification when a compliance check turns to warn ahead of an entered tournament.

Approval gate. The agent never sends, agrees a term or marks a placement Signed on its own (M-GATE-1). "Approve & schedule" is the only path to a send, and the footer states the email leaves from the player's own address. A brand only moves to Signed once the player uploads the signed contract; a compliance warn is fixed by changing what is worn, never by the agent editing the finding. Benchmark figures are always historical and anonymised, never a promise of what the player will earn (section 7).

Failure behaviour. If brand research or drafting is unavailable, the previous week's pipeline stays visible with a banner naming its last refresh; a Fit score older than seven days is marked "not refreshed this week" rather than reused as current. If a tier's compliance ruleset cannot be confirmed, the row shows "not verified this week" rather than a false pass.

Audit. Each weekly run records trigger, inputs hash, model, pipeline delta and cost; each send records the player, timestamp, device, recipient and text as sent; each stage change, compliance override and contract upload is logged with who and when (M-GATE-4).

Cost. Target under A$0.05 per weekly pass across up to ten brands; a draft is generated once per outreach step, not on every view.

## 4. Surfaces and states

### 4.1 Sponsor Agent page (`#/agent/sponsor`)

Header: title, description "Finds brands that fit, writes the first email in your voice, keeps the kit compliant and tells you what a deal like yours is worth. Elite, from v2.", and badge "Elite · preview with sample data" for a Pro viewer (Elite replaces this with "Early access" per M-TIER-4, plus the feedback link).

Studio bar (Pro preview): "This is a preview. The pipeline, drafts and benchmarks below are examples." with the market context "Elite is A$149 a month, A$119 billed annually. Players at your ranking who run structured outreach close one or two regional deals a season, typically A$3,000 to A$12,000 plus product." Two actions: "Upgrade to Elite" (toast "Upgrade · Stripe Checkout") and "Finish your media kit first" (links to `#/profile`).

Pipeline card: "Pipeline", "Weekly review every Monday. The agent moves nothing without you; it drafts, you send.", badge "6 brands · 1 in talks". Four columns as built (a fifth, Declined, is specified in section 5 but not yet in the file):

| Stage | Brand (category) | Note | Fit / value |
|---|---|---|---|
| Researching | Head Austria (Racquets) | Sponsors two Austrian Challenger players, both ranked below her | Fit 82 · A$4 to 8k plus strings |
| Researching | Löffler (Apparel) | Austrian sportswear, no tennis athlete yet | Fit 74 · product plus A$2 to 4k |
| Researching | Austrian Airlines (Travel) | Young-athlete programme; 31 flights this season | Fit 61 · flights, not cash |
| Contacted | Wilson EU (Racquets) | Sent Tue 9 Sep, opened twice, no reply; follow-up drafted for Tue 16 | Fit 79 · A$5 to 10k plus product |
| In talks | Sportland Steiermark (Regional) | Call booked Thu 18 Sep 10:00; asked for patron numbers and the Poznań result | Ask A$6,000 · benchmark A$4.5 to 7k |
| Signed | Tennis Point AT (Active) | Strings and grips through 2026, left sleeve, kit-compliant | Product, roughly A$1,800 value |

Outreach draft card: "Outreach draft, Wilson EU follow-up", "Claude Sonnet, in your voice, from your media kit and the Poznań result.", badge "Sends Tue 16 Sep". The draft opens "Hi Lena," cites the Poznań quarter-final and twelve patrons at roughly three-quarters open rate, and asks for fifteen minutes, signed "Arya". Footer: "Approve & schedule" (toast "Elite feature, upgrade to send" on Pro), "Edit", "Sent from your email, not the agent's."

Kit compliance card: "Kit compliance", "Checked against ATP Challenger and ITF rules before anything goes on a shirt." Three rows: pass "Sleeve logo, Tennis Point" ("Within the 19.5 cm² limit"); warn "Second sleeve, Sportland" ("Two commercial logos on sleeves exceed ATP Challenger allowance. Chest or shorts instead."); pass "Cap, manufacturer only" ("Compliant").

Deal benchmark card: "What a deal like yours is worth", "Anonymised, from players ranked 400 to 600 in the last two seasons." By category: Racquets A$4k to 10k plus frames and strings; Apparel A$2k to 4k plus full kit; Regional A$3k to 7k plus appearances; Travel, no cash figure, flights and hotels only.

States: fresh; stale (a row older than seven days, "not refreshed this week"); weekly run failed (previous pipeline with a banner); empty pipeline ("No brands yet, finish your media kit and the agent will suggest its first three"); Pro preview (studio bar, actions replaced with upgrade toasts); Elite live ("Early access" badge, feedback link, real send and Signed actions enabled).

### 4.2 Media kit (`#/profile`, Media kit tab)

"A one-page PDF sponsors can forward. Numbers update from your ranking feed and Stripe; you write the rest." Fields: Following ("Instagram 4,820, TikTok 2,140"), Reach over thirty days ("61,000 views, 1,240 profile visits"), Story in three lines (reference value: "No academy, no federation funding. Twelve patrons and a Challenger quarter-final in Poznań. Every week is documented, honestly, for people who backed me before results."), Categories open (Racquets, Apparel and Travel pressed, Nutrition and Finance not). The kit itself (photo, ranking, season results, patron count, categories) auto-generates as one page. Actions: "Download PDF" (toast "Media kit, arya-dubey-2026.pdf") and "Sponsor Agent uses this" (links to `#/agent/sponsor`).

### 4.3 Settings, sidebar and onboarding

Settings > Agents groups "Sponsor Agent, Fan Agent" as one dimmed row, no schedule selector, labelled "Elite, preview" linking to `#/agent/sponsor` with an "Elite" badge, distinct from the interactive Tournament, Content, Mindset and Financial rows. Sidebar: a locked "Sponsor" item, "Elite" tag, under Agents. Onboarding's Elite plan note: "Elite makes sense once patrons pass 50 or you want the forecast and the Sponsor Agent. 5% platform fee."

## 5. Functional requirements

SP-1 (Must). The pipeline holds five stages, Researching, Contacted, In talks, Signed and Declined, and every brand card shows a category tag, a fit rationale and a Fit score out of 100; the prototype currently builds four of the five (no Declined column yet, section 12).

SP-2 (Must). The weekly Monday review recomputes each Researching and Contacted brand's Fit score, and never changes the stage of a brand the player has already moved to Contacted, In talks, Signed or Declined.

SP-3 (Must). An outreach draft is generated only after the player greenlights contact, is written in the player's voice from the media kit and confirmed results, and never states a result, a patron count or a figure not in those sources.

SP-4 (Must). "Approve & schedule" is the only action that queues a send; nothing is sent, agreed or posted without it, and the footer states the email leaves from the player's own address (M-GATE-1, M-GATE-2).

SP-5 (Must). A Contacted brand with no reply after seven days receives one drafted follow-up per week, never more than one open follow-up at a time.

SP-6 (Must). Every Signed or In talks placement is checked against ATP or ITF branding and logo-size rules for the current tournament tier, each item pass or warn with a plain-language reason and, where relevant, a suggested alternative placement.

SP-7 (Should). Before each entered tournament, the agent surfaces a one-screen kit compliance checklist for that event's tier, so a problem is caught before the player walks on court rather than during a code-violation review (section 12).

SP-8 (Must). The deal benchmark table is built from anonymised historical placements in the ranking band, shown by category with a cash range and, where relevant, a non-cash description; every benchmark or market-sizing figure states it is historical and anonymised, never a guarantee of what the player will earn (M-PRIV-5, section 7).

SP-9 (Must). The media kit auto-generates from the profile, ranking feed and Stripe patron count as a one-page PDF, regenerating whenever fields, ranking or patron count change.

SP-10 (Must). Contracts are stored as an uploaded document with a renewal or expiry reminder; every screen showing a contract or a compliance check derived from it states plainly that the product provides storage and reminders, not legal advice.

SP-11 (Must). A brand only reaches Signed when the player has uploaded the signed contract; the agent cannot set this stage on its own.

SP-12 (Must). On Free the Sponsor Agent is absent and unreachable; on Pro the page shows a sample pipeline, draft and the real benchmark table under the studio-bar banner, "Upgrade to Elite" the only action; on Elite it shows the player's live pipeline with an "Early access" badge and feedback link (M-TIER-1, M-TIER-4).

SP-13 (Must). Every weekly run, send, stage change, compliance override and contract upload is recorded in the audit log with who acted, when and from which device (M-GATE-4).

SP-14 (Must). If the weekly review cannot complete, the prior pipeline remains visible with a banner naming the last successful run; a Fit score or compliance row older than seven days is labelled "not refreshed this week".

SP-15 (Should). Selecting a Fit score shows the factors behind it (category match, geographic relevance, existing sponsorship overlap, ranking-band fit), so it is explainable rather than a bare figure.

SP-16 (Should). The player can add a brand manually to Researching or dismiss a suggested one with a reason (mirroring the Tournament Agent's excluded-list pattern, T-21); once In talks, the agent proposes an opening ask grounded in the benchmark range, adjustable before any call or reply.

SP-17 (Should). The manager share link shows the realised cash value of a Signed placement as an income line, and nothing else from this surface (M-SHARE-2).

SP-18 (Won't, Release 2). Automated contract negotiation, counter-offer drafting or e-signature collection inside the app; contracts are uploaded after they are agreed outside the product. Batch outreach to more than one brand at a time is also Won't; every send remains a single, individually approved email.

## 6. Data dictionary

Brand (one per pipeline card):

| Field | Type | Source | Notes |
|---|---|---|---|
| id, name, category | string | agent, player | category examples Racquets, Apparel, Travel, Regional |
| stage | enum researching, contacted, inTalks, signed, declined | player | persisted, agent never changes it unassisted |
| fitScore | integer 0..100 | agent | section 7 |
| fitRationale | string | agent | one line, for example "Sponsors two Austrian Challenger players" |
| lastContactAt, nextFollowUpAt | date | agent, Resend-equivalent send log | follow-up default 7 days |
| ask, benchmarkLow, benchmarkHigh | money | agent, player | shown only from In talks |
| kitComplianceRefs[] | array of ids | agent | links to compliance rows |
| contractRef | string or null | player upload | required for Signed |
| declinedReason | string or null | player | required when stage is Declined |

Outreach draft: id, brandId, subject, body, builtFrom[], status (draft, scheduled, sent, failed), sentAt, sentFrom. Kit compliance row: id, contractRef, item, tournamentTier, state (pass, warn, not verified), reason, suggestedFix. Deal benchmark row: category, rankingBandLow, rankingBandHigh, cashLow, cashHigh, plusDescription, sampleWindow. Media kit: following, reach, story, categoriesOpen[], generatedAt, pdfRef. Contract: id, brandId, uploadedAt, term, expiresAt, reminderSentAt[], fileRef. Run record: id, trigger, startedAt, completedAt, inputsHash, model, promptVersion, pipelineDelta, cost.

## 7. Business rules and formulas

Fit score: a 0 to 100 figure combining category match, geographic relevance (a national or regional brand scores above one with no presence in the player's home tour region), existing tennis sponsorship at or below the player's ranking, and overlap with a category already signed (a signed racquet deal lowers a competing racquet brand's score). Exact weighting is a placeholder pending player review (section 12).

Follow-up cadence: a Contacted brand with no reply becomes eligible for one follow-up seven days after the previous send; a second silence closes the loop to Declined with "No reply after two attempts" unless the player intervenes.

Deal benchmark and market claims: every benchmark, market-sizing sentence and Ask figure states the ranking band and season window it is drawn from and is worded as historical observation, never an expected or guaranteed outcome, consistent with the Australian Consumer Law's prohibition on misleading conduct and false representations about future matters; exact disclaimer wording needs legal review before Release 2 (section 12).

Kit compliance thresholds: sourced from ATP and ITF equipment and identification rules current at the time of the check (a single sleeve logo within 19.5 square centimetres passes; a second commercial sleeve logo at Challenger level fails and is redirected to chest or shorts); rules are tier-specific, so a compliant placement at one tier may fail at another.

Contract reminders: a renewal or expiry reminder fires 60, 30 and 7 days before the contract's end date; the cadence is configurable and is a placeholder pending review (section 12).

## 8. Acceptance criteria

SP-AC-1. Given the weekly review has completed, when the player opens `#/agent/sponsor` on Elite, then Researching shows Head Austria at Fit 82, Contacted shows Wilson EU at Fit 79, In talks shows Sportland Steiermark with an ask of A$6,000 against a benchmark of A$4.5 to 7k, and Signed shows Tennis Point AT at roughly A$1,800 of product value.

SP-AC-2. Given Wilson EU was contacted on Tuesday 9 September with no reply, when seven days pass, then a follow-up draft appears for Tuesday 16 September referencing the Poznań result and current patron count.

SP-AC-3. Given the Wilson EU follow-up draft is open, when the player taps Approve & schedule, then a confirm step states the email will be sent from her own address on the scheduled date, and nothing leaves the app until confirmed (M-GATE-1, M-GATE-2).

SP-AC-4. Given the kit compliance card is showing, when the player reviews the Sportland row, then it shows a warn state with the reason "Two commercial logos on sleeves exceed ATP Challenger allowance. Chest or shorts instead." and no Signed action is available until the placement is changed.

SP-AC-5. Given the deal benchmark card is showing, when the player reads the Racquets row, then it shows A$4k to 10k cash plus frames and strings, sourced from players ranked 400 to 600 in the last two seasons, with no language implying the player herself will receive that figure.

SP-AC-6. Given a player on Pro opens `#/agent/sponsor`, when the page renders, then the studio bar shows the preview banner and market sentence, the pipeline, draft and benchmark cards show sample data, and "Approve & schedule" and "Upgrade to Elite" both surface the same upgrade path rather than sending anything.

SP-AC-7. Given a player on Free opens the app, when the sidebar renders, then no Sponsor entry appears and `#/agent/sponsor` is not reachable.

SP-AC-8. Given a player on Elite has no uploaded contract for Sportland Steiermark, when she attempts to mark the brand Signed, then the app requires a contract upload first and does not change the stage without one.

SP-AC-9. Given the weekly review fails to complete, when the player opens the page, then the prior week's pipeline is shown with a banner naming the last successful run, and any Fit score older than seven days is marked "not refreshed this week".

SP-AC-10. Given the player removes Travel from her media kit's open categories, when the next review runs, then Austrian Airlines' Fit score is recomputed and its rationale reflects the category no longer being open.

SP-AC-11. Given a contract's expiry date is 60 days away, when the daily reminder pass runs, then a reminder names the contract, the brand and the days remaining, and the contract view states "Document storage and reminders, not legal advice."

SP-AC-12. Given the coach opens the coach link, when any page renders, then no Sponsor Agent content appears; given the manager opens the manager link and Tennis Point AT's product value has been recorded as income, then only that income line appears, with no pipeline, draft or benchmark data anywhere on the manager's view.

## 9. Notifications produced

FYI: "Pipeline updated, 1 in talks" after a stage change with no urgent action; "Wilson EU follow-up ready" after a seven-day silence; "This week's kit compliance is clear" after a run with no warn rows. For you: "Kit compliance warning before <tournament>" when a warn row exists for an entered event, action Open; "Contract with <brand> renews in <n> days" at the 60, 30 and 7-day marks.

## 10. Sharing scope

Coach: nothing (M-SHARE-1). Manager: the realised cash value of a Signed placement as a Financial Agent income line, nothing else (M-SHARE-2). Public profile: nothing; the media kit PDF is downloaded and sent by the player herself, not published automatically.

## 11. Analytics events

pipeline_run_completed (brandsScanned, stageChanges, cost), pipeline_viewed, brand_stage_changed, draft_generated, draft_approve_started, draft_sent, draft_edited, followup_ready, kit_compliance_flag_shown, kit_compliance_fix_applied, benchmark_viewed, contract_uploaded, contract_reminder_sent, media_kit_regenerated, media_kit_downloaded, upgrade_cta_clicked. Product KPIs: drafts approved per month, median days to first reply, kit compliance warn rate at entry, Signed placements per season.

## 12. Out of scope and open questions

Out of scope for Release 2: automated contract negotiation or e-signature collection; batch outreach to more than one brand at a time; a currency-converted benchmark table for a home currency other than AUD; agent-suggested legal terms of any kind.

Open questions: the exact weighting behind the Fit score, unspecified beyond category, geography, overlap and ranking-band relevance; the Declined pipeline stage, specified here but not yet built in the prototype; whether a manual "review now" trigger should exist for parity with the Tournament and Content Agents; the contract reminder cadence; the legal wording of the "not legal advice" disclaimer and the historical, non-guaranteed framing on every benchmark figure, both needing review before Release 2; whether kit compliance rules should be sourced live from ATP and ITF publications or kept as a periodically updated internal table.

Inconsistencies found between the prototype and PRD-00: PRD-00's tier table (section 4) specifies three states for the Studio agents, no access on Free, a preview on Pro, early access on Elite, but the prototype implements only one static preview state, giving no way to see a genuinely locked Free view or a live Elite view. M-TIER-4 specifies an "Early access" badge and a feedback link for Elite features; the prototype's badge instead reads "Elite · preview with sample data" with no feedback link. M-TIER-1 describes a locked surface as carrying one upgrade action; the studio bar here shows two ("Upgrade to Elite" and "Finish your media kit first"), reasonable given the media kit dependency but not what the master rule describes. M-GATE-2 requires every proposal to state what happens on approval in one sentence next to the control; the outreach draft's footer states who the email is sent from but not the operative fact of the action itself, unlike the Tournament and Content Agent pattern.
