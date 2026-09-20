# PRD-00 · ProCircuit master requirements

Version 0.4 · 13 September 2026 · Owner: Manu Dubey · Status: draft for review · Change from 0.1: staff actor and roles added (sections 2, 5.7), M-GATE-4 extended to staff actions, PRD-13 added to the pack

This is the parent document for the ProCircuit requirements pack. It holds everything that is true across the whole product: who it is for, what it promises, how tiers and entitlements work, the cross-cutting rules every agent obeys, non-functional requirements, and the conventions the per-agent documents follow. Each agent then has its own document (PRD-01 Tournament Agent, PRD-02 Match Scribe, PRD-03 Financial Agent, PRD-04 Fans, PRD-05 Content Agent, PRD-06 Mindset Coach, PRD-07 Fuel, PRD-08 Conditions and Equipment, PRD-09 Sponsor Agent, PRD-10 Fan Agent, PRD-11 Onboarding and Public Profile, PRD-12 Settings and Sharing, PRD-13 Platform admin and operations). Where this document and an agent document disagree, this document wins until the conflict is resolved in review.

Reference material: the clickable prototype (`procircuit-dashboard.html`, published), the Stage 3 variant for Lukas Neumayer, the Team Sinner view, `PROCIRCUIT-CONTEXT.md`, and the architecture document `procircuit-arch-merged.html`. Requirements cite prototype routes (for example `#/agent/tournament`) rather than describing layout; the prototype is the visual reference and this pack is the behavioural one.

Requirement IDs use the form `M-<area>-<n>` in this document and `T-<n>`, `S-<n>` and so on in the agent documents. Priority uses MoSCoW: Must for launch, Should for the first quarter after launch, Could when capacity allows, Won't for this release. Every Must has at least one acceptance criterion in Given/When/Then form.

---

## 1. Problem and vision

A professional tennis player ranked between roughly #150 and #1500 runs a small business alone: choosing which tournaments to enter and when, paying for flights and hotels out of thin prize money, keeping supporters engaged, staying mentally steady through weekly losses, and adjusting equipment to climates they have never played in. Almost none of this is tennis, and almost none of it is done well, because there is no staff to do it.

ProCircuit is a set of agents that do that work and wait for approval before acting. The player captures with their voice and phone camera; the agents read rankings, calendars, ledgers and notes, and come back each morning with three answers: how long the money lasts, what decision is due, and who has joined or left. The product wins if a player can see those three answers in ten seconds on a phone in a hotel corridor and make the week's one decision from them.

Design principle that governs every feature: the agent proposes, the player decides. Nothing leaves the app (an entry, a payment, an email, a post) without a deliberate tap. Where the agent is confident it says so; where it is not, it shows its uncertainty rather than hiding it.

## 2. Users and personas

Primary: the player, on either tour. ProCircuit serves ATP and WTA players equally: every ranking rule below reads "ATP or WTA" for the player's tour, the ITF world tennis rankings (men's and women's) are the Stage 1 ladder for both, and the shortlist scans the ITF, Challenger, WTA 125 and tour-level calendars appropriate to the player's tour and stage. Doubles is in scope at the level of ranking and money: the player's doubles ranking is shown beside singles and doubles prize money flows through the Financial Agent; doubles draws, partners and doubles-specific shortlists are Release 2. Decided 13 September 2026 (register A21). Three reference personas.

Arya Dubey (fictional): Austrian, 23, ATP #487, ITF #212, Stage 2 Emerging. Pro plan. Twelve patrons, MRR A$612, reserves A$9,450, burn A$1,140 a week, runway 8.3 weeks. Coach Marko, parent and manager Gerhard. Travels alone to ITF and Challenger events across Europe with occasional trips to Asia. Speaks German and English, writes notes in German with English tennis vocabulary.

Lukas Neumayer (real, public facts only): Austrian, 24, ATP #227, career high #157, Stage 3 Established. Plays a Challenger-first calendar, defends more points, has a part-time coach and a stringer relationship. Everything private about him in the prototype is illustrative.

Sofia Berger (fictional): German, 25, WTA #512, doubles #276, ITF #241, Stage 2 Emerging, from Stuttgart, based in Munich. Pro plan. Same commercial numbers as Arya (twelve patrons, MRR A$612, reserves A$9,450, runway 8.3 weeks) so the two Stage 2 files can be compared like for like; a pending W75 Genoa doubles semi-final cheque at her half. Coach Julia, parent and manager Bernd. The prototype is `procircuit-dashboard-berger.html`.

Secondary users who have their own read-only or limited surfaces: the coach (matches, shortlists, patterns, never money), the parent or manager (runway, P&L, expenses, patrons, no notes), the patron (the public profile and tiered updates, and the Fan Agent conversation on Elite), and the sponsor (the media kit and outreach). A team persona (Team Sinner) exists as a separate concept dashboard and is out of scope for this release.

Internal users: ProCircuit staff, who use a separate admin console (PRD-13) in three roles, support (player lookup and account actions), ops (agent health and data ingestion) and owner (money, provider kill switches, deletions, role grants). Staff never see player notes, transcripts, audio or moods, and cannot take any external action on a player's behalf; their job is to keep the platform running and the player able to act.

## 3. Ranking intelligence stages

The product adapts what it leads with to the player's verified ranking. Stage detection is automatic and can be overridden in the profile.

| Stage | Detection (tour ranking = ATP or WTA singles) | What leads | Shortlist bias |
|---|---|---|---|
| 1 · Building | No tour points, or tour ranking above about 800 | ITF ranking (men's or women's), WTN or UTR shown | ITF M15 and M25, or W15 and W35 |
| 2 · Emerging | Tour ranking roughly 450 to 800 | Tour number leads, ITF as a chip, WTN and UTR hidden, doubles ranking as a chip when inside 500 | Men: ITF M25 and Challenger 50 to 75. Women: ITF W35 to W100 and WTA 125 qualifying |
| 3 · Established | Tour ranking inside about 450 | Tour number only, doubles ranking as a chip | Men: Challenger-first, ATP 250 qualifying. Women: WTA 125 and WTA 250 qualifying, ITF W100 |

The thresholds are the same for both tours until research shows they should differ (Section D placeholder, register A21). Stage detection uses the singles ranking; a player whose doubles ranking is materially better than singles (say inside 200 in doubles and outside 500 in singles) keeps the singles-derived stage and sees the doubles number promoted to the hero's first chip.

M-STG-1 (Must). The system detects the stage from the verified singles ranking on the player's tour (ATP or WTA) on every ranking refresh and stores it on the player. Given a player whose ATP or WTA ranking crosses from 810 to 790, when the Monday refresh runs, then the stage becomes 2 and the dashboard hero switches to tour-ranking-led within that refresh.

M-STG-3 (Must). The player record carries a tour (ATP or WTA) set from the verified ranking source at onboarding, and every label, feed, calendar and shortlist rule reads it; no surface may hard-code "ATP". Given a WTA player at #520, when the dashboard renders, then the hero reads "WTA singles ranking", the shortlist holds women's events, and the ITF chip shows the women's ranking.

M-STG-4 (Must). The doubles ranking on the player's tour is stored with each snapshot and shown as a chip beside singles when inside 500; doubles prize money is a prize receivable like any other, split by the player's share (default 50 percent) before withholding. Doubles draws, partners, doubles shortlists and partner cost-sharing are Release 2.

M-STG-2 (Must). The player can pin a stage manually in Profile; a pinned stage is not changed by detection and shows a "pinned" indicator.

## 4. Tiers and entitlements

Prices in Australian dollars, shown to the player in their home currency through Stripe. Fourteen-day trial of Pro with no card required. Annual billing at the discounted rate.

| Capability | Free | Pro (A$49 / A$39 annual) | Elite (A$149 / A$119 annual) |
|---|---|---|---|
| Verified ranking, dashboard, 52-week chart | Yes | Yes | Yes |
| Match Scribe | 10 notes a month, no coach share | Unlimited | Unlimited |
| Tournament Agent | Read-only shortlist, no cost model | Full | Full |
| Financial Agent | No | Full, receipt scanning | Full |
| Fans (patron programme) | Public profile only | Up to 50 patrons, 8 percent platform fee | Unlimited patrons, 5 percent fee |
| Content Agent | No | Full | Full |
| Mindset Coach | Daily insight only | Full, patterns | Full |
| Fuel | No | Full | Full |
| Conditions and Equipment | Brief only | Full, tension tests, stamps | Full |
| Baseline ranking forecast (TimesFM) | No | No | Yes |
| Sponsor Agent and Fan Agent (Studio) | No | Preview | Early access |
| Agent Studio (custom schedules and prompts) | No | No | Yes |
| Coach and manager share links | No | Yes | Yes |

M-TIER-1 (Must). Every gated surface shows the same locked state: the real UI dimmed with a single explanation line and an upgrade action; never a blank page. Given a Free player who opens `#/agent/financial`, when the page renders, then the Financial Agent layout appears with sample data, a lock badge and one "Start Pro trial" button.

M-TIER-2 (Must). Downgrade never deletes data. Given a Pro player with 40 patrons who moves to Free, when the change takes effect at period end, then patron records, ledger and notes are retained and read-only, patron billing is paused with a notice to patrons, and the player can export everything.

M-TIER-3 (Must). The patron cap on Pro is enforced at sign-up time on the public page: the 51st patron sees a waitlist, not an error.

M-TIER-4 (Should). Elite early-access features carry an "Early access" badge and a feedback link in their header.

## 5. Cross-cutting requirements

### 5.1 The approval gate

M-GATE-1 (Must). No agent performs an external action (tournament entry or withdrawal, payment, email to patrons, social post, message to a sponsor or fan) without an explicit player action in the app. Scheduled runs produce proposals, never actions. Given the Content Agent has a draft ready at 06:12, when the schedule fires, then the draft appears in the editor with a notification and nothing is sent.

M-GATE-2 (Must). Every proposal shows what will happen on approval in one sentence next to the approve control (for example "A$1,360 logged as a planned expense").

M-GATE-3 (Must). Approvals are reversible where the outside world allows it (withdraw from an entry before the deadline, unpublish a draft) and the UI says when they are not (a payout that has been sent).

M-GATE-4 (Must). An audit log records every agent run (trigger, inputs hash, model and version, output, cost), every approval (who, when, from which device), and every staff action on the player's account (admin name, role, the consequence sentence shown at confirmation, and a written reason for deletions, comps, refunds, data imports and provider switches). Visible to the player under Settings > Data & safety, with staff actions marked as such.

### 5.2 Identity and verification

M-ID-1 (Must). Sign-in by email with a magic link; optional passkey. No passwords stored.

M-ID-2 (Must). Ranking verification at onboarding by matching the player's name and country against the ATP, WTA and ITF (men's and women's) ranking feeds, which also sets the player's tour; ambiguous matches ask the player to choose; unmatched players can proceed unverified with an "unverified" badge and no public profile until verified.

M-ID-3 (Must). Players under 18 require a guardian email at onboarding; the guardian receives the manager share link by default and the public profile is off by default.

### 5.3 Data model shared across agents

The following entities are owned by the platform and read by several agents. Field-level dictionaries live in the agent documents; ownership is fixed here.

Player (profile, stage, tier, home currency, languages, units, time zone, country). Ranking snapshot (weekly tour singles and doubles points and positions for ATP or WTA, ITF points and position, points by tournament with expiry week). Tournament (id, name, tier, surface, indoor or outdoor, city, country, dates, entry deadline, acceptance status, prize table, points table, ball, venue altitude, venue coordinates). Entry decision (tournament, status entered or skipped or withdrawn, planned cost, timestamps). Expense and income lines (amount in original currency, currency, locked FX rate to home currency, category, tournament attribution, receipt reference, source manual or scanned or planned). Reserve balance entries (amount, date, source manual). Prize receivable (tournament, event singles or doubles, round, gross, player share, withholding, expected date, status). Patron (person, tier, since, status, city and country, opens per update). Patron update (draft, versions by language, recipients, sent time, opens, joins attributed). Note (audio reference until transcribed, transcript, language, context, result, opponent, tags, mood, conditions stamp, agents that consumed it). Pattern (statement, evidence note ids, confidence, kind mental or physical, dismissed flag). Equipment profile (frame, string, baseline tension mains and crosses in kg, frames carried, restring cadence, overgrip, practice balls). Conditions brief (tournament, forecast window, air, humidity, wind, altitude, ball, indoor or outdoor, recommendations). Notification (agent, category for-you or fyi, title, body, action, read flag). Share link (scope coach or manager, token, revoked flag, last opened).

M-DATA-1 (Must). Money is stored with its original currency and the ECB reference rate on the transaction date, never overwritten. Display conversion is a view. Given an expense of €38.50 on 10 Sep, when the player switches home currency from AUD to USD, then the line shows the USD amount at the 10 Sep rate and the original €38.50 underneath.

M-DATA-2 (Must). Prize receivables stay in the paying currency until the player marks them received; only then does a realised amount enter reserves.

### 5.4 Language

M-LANG-1 (Must). App language is a preference (launch set: English, Chinese, Spanish) applied to the interface only. The player's notes, drafts and the agents' prose stay in the language they were produced in unless the player asks for a translation. Given app language Chinese, when the player opens a German voice note, then the transcript remains German and the chrome around it is Chinese.

M-LANG-2 (Must). Match Scribe detects the spoken language per note (Whisper language detection) with an override in Preferences; mixed-language notes are transcribed as spoken.

M-LANG-3 (Should, Release 2). Patron updates can be produced in several languages; the player picks the set in Preferences and approves each version separately. Release 1 ships one patron-update language per player, chosen in Preferences; the Mindset Coach addresses the player in that language. Decided 13 September 2026 (worksheet 9).

M-LANG-4 (Should). Translatable interface strings are single text nodes with no inline markup, so the string table can be applied and reverted exactly.

### 5.5 Currency and units

M-CUR-1 (Must). Home currency preference at launch: AUD, USD, CNY. Every amount, chart axis and tier price follows it. Rates come from the ECB daily reference; the app shows the rate used on the day of the transaction and states the source.

M-CUR-2 (Must). Units preference Metric or Imperial drives tension (kg or lb), temperature (°C or °F) and distance (km or mi) everywhere, including inside agent prose ("go up a kilo" becomes "go up two pounds").

### 5.6 Notifications

M-NOTIF-1 (Must). One notification rail in the app with two categories: For you (needs a decision or is about the player's money or entries) and FYI. Agents may not create more than one For-you notification per run.

M-NOTIF-2 (Must). Push and email are per agent and per category in Settings; quiet hours default 22:00 to 07:00 local; deadline notifications ignore quiet hours only inside the last 24 hours before a tournament deadline.

M-NOTIF-3 (Should). A weekly digest email replaces individual FYI emails when the player has more than five in a week.

### 5.7 Sharing and roles

M-SHARE-1 (Must). Coach link scope: results, note summaries (not transcripts or audio), shortlists and entry decisions, patterns, conditions briefs. Never money, never moods by date.

M-SHARE-2 (Must). Manager link scope: runway, reserves, P&L, expenses with receipts, patron health and payouts. Never notes, never agent drafts.

M-SHARE-3 (Must). Links are revocable in one tap, show last-opened time and count, and expire after 90 days without renewal. Revocation takes effect within one minute.

M-SHARE-4 (Should). A coach with an account can be attached directly (invited by email) instead of by link, with the same scope.

M-SHARE-5 (Must). Staff roles (support, ops, owner) are granted per person by the owner, are separate from any player identity, and each sees only its own areas of the admin console; the server enforces the role on every call. Scope per role is defined in PRD-13 section 2.

### 5.8 Privacy, retention and safety

M-PRIV-1 (Must). Audio is deleted once the transcript is confirmed by the player, or after 7 days, whichever is first; the transcript is retained. Menu and receipt photos are read once and deleted after extraction; the receipt thumbnail kept in the ledger is a generated rendition, not the photo.

M-PRIV-2 (Must). Export everything (JSON plus CSV plus transcripts) and Delete account with a 14-day cooling-off period are available under Settings > Data & safety.

M-PRIV-3 (Must). The Mindset Coach never diagnoses, never uses clinical language about the player, and shows a "someone to call" card with local resources whenever a note or check-in matches a distress pattern. This card cannot be disabled.

M-PRIV-4 (Must). Model providers are used with no training on player data; the list of providers and regions is published in Settings > Data & safety.

M-PRIV-5 (Must). Real-person governance for demos and marketing: only public facts about real players, private data labelled illustrative, no photographs without licence, no fabricated staff activity, opponents anonymised.

### 5.9 Platform behaviour

M-PLAT-1 (Must). Mobile first. Every route is usable at 390px wide with no horizontal scroll; primary decisions are reachable within two taps from the dashboard on mobile (the decision card, the FAB capture sheet).

M-PLAT-2 (Must). Offline capture: a voice note or a receipt photo taken without signal is queued locally and uploaded when connectivity returns, with a visible queue state.

M-PLAT-3 (Must). Light and dark themes following the system with a manual override; the design system is the shadcn Vega preset as captured in the prototype; motion respects reduced-motion and reduced-transparency settings.

M-PLAT-4 (Should). Keyboard: sidebar collapse on Cmd/Ctrl+B, focus order matches visual order, all sheets and menus trap and return focus.

M-PLAT-5 (Should). Onboarding walkthrough shown once with a persistent "Take the tour" entry point; contextual tooltips on any control whose meaning is not obvious from its label.

## 6. Non-functional requirements

Performance: dashboard first meaningful paint under 1.5 s on a mid-range phone on 4G; agent proposals visible within 2 minutes of a manual re-run; transcription of a 60-second note in under 20 seconds.

Availability: 99.5 percent monthly for the app; scheduled runs retry three times with backoff and notify the player if a morning run fails ("This morning's run didn't complete").

Cost: an average Pro player's monthly model and API spend must stay under 15 percent of the Pro price; every agent run records its cost and the Agent Studio (Elite) surfaces it.

Security: encryption at rest and in transit, per-player data isolation, Stripe handles all card data, share-link tokens are 128-bit random and rate-limited.

Compliance: Australian Privacy Act and APPs as the baseline, GDPR for European players (right of access, erasure, portability), PCI scope minimised via Stripe Connect Express, Australian Consumer Law for pricing and trial disclosures (no drip pricing; annual price stated as a total).

Accessibility: WCAG 2.2 AA; charts carry text equivalents (the three answers are also written as sentences under each tile).

Observability: per-agent run dashboards (count, latency, cost, approval rate, dismiss rate); approval rate below 30 percent on any agent for two weeks is a product alert.

## 7. Integrations (owned by platform)

ATP and WTA ranking feeds (singles and doubles; TDI or licensed equivalents) weekly with a live check on demand; ITF men's and women's rankings and calendars; the WTA 125 and tour-level calendars; tournament fact sheets (ball, surface, venue) from the ITF and ATP calendars with manual override; weather forecast for venue coordinates (7-day, hourly) refreshed daily inside the travel window; ECB daily FX; Stripe Billing for subscriptions and Stripe Connect Express for patron payouts; Resend for patron email; Whisper (or equivalent) for transcription; a structured-output LLM for extraction and drafting with schema validation on every call; TimesFM for the Elite forecast; calendar feed (ICS) out; no bank aggregation (explicit decision).

## 8. Release plan

Release 1 (launch): ATP and WTA players, doubles ranking and prize money, dashboard and stages, Match Scribe, Tournament Agent, Financial Agent, Fans, Content Agent, Mindset Coach, Conditions and Equipment (brief, stamps, tension test), Fuel, onboarding, public profile, settings, sharing, notifications, preferences (three languages, three currencies), Free and Pro tiers.

Release 2: doubles draws, partners and partner cost-sharing; Elite tier with Baseline forecast, Sponsor Agent and Fan Agent early access (with the three Studio tier states and the Early access badge of M-TIER-4), Agent Studio, weekly digest, direct coach accounts, patron updates in several languages (M-LANG-3).

Release 3 and later: Team surfaces, additional currencies and languages, stringer and physio share scopes, marketplace of agent presets.

## 9. Conventions for the agent documents

Each agent document has the same twelve sections: purpose and job to be done; users and entitlements; the agent contract (trigger, inputs, outputs, approval gate, failure behaviour, audit, cost); surfaces and states (each route and every state with a prototype citation); functional requirements with IDs and priorities; data dictionary; business rules and formulas; acceptance criteria in Given/When/Then; notifications produced; sharing scope; analytics events; out of scope and open questions.

A requirement is written as a single testable sentence about observable behaviour. Layout and styling are not requirements; they are the prototype. Copy that carries meaning (what the agent promises or refuses) is a requirement and is quoted.

## 10. Open questions for review

Settled 13 September 2026: Free sees the shortlist and the Conditions brief with cost, outcomes and entry controls locked behind one Start Pro trial action; the patron fee is 8 percent on Pro and 5 percent on Elite, charged on the gross patron payment with Stripe's charge deducted separately and shown as its own line. Still open: whether the ECB reference rate is acceptable for CNY or a market rate is needed. Whether a stringer share scope belongs in Release 1 given the Conditions layer proposes tension tests. Whether the Mindset Coach's distress card needs jurisdiction-specific review before launch in each country.
