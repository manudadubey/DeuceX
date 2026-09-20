# ProCircuit requirements pack: review register

Version 0.2 · 13 September 2026 · Owner: Manu Dubey · Companion to PRD-00 through PRD-13

Writing the thirteen requirements documents against the prototype surfaced contradictions the prototype had been carrying quietly. Each one is listed here with the document that found it, what the two sides say, and what the requirement currently assumes so that work is not blocked. Every row marked "decision needed" changes behaviour or copy and should be settled before build. A1 to A21 were settled on 13 September 2026; A1 to A17 have decision records in DECISIONS-WORKSHEET.md v0.2, A18 to A20 are recorded inline below and in PRD-13 v0.2. Rows marked "prototype bug" need no decision, only a fix.

The convention throughout the pack: where the prototype and PRD-00 disagree, the document follows PRD-00 and records the disagreement here.

---

## A. Decisions needed before build

**A1. Platform fee on patron income: 8 percent or 10 percent.** Decided 13 Sep: 8 percent Pro, 5 percent Elite; fix the arithmetic (worksheet 5). PRD-00 section 4, the Fans payout footer and the Stripe notification all say 8 percent. The payout table in the prototype deducts a flat 10 percent (A$61 from A$612, A$55 from A$554) and the Financial Agent's MRR tooltip says "after the 10% platform fee and Stripe". Found by PRD-03 and PRD-04. Both documents assume 8 percent plus Stripe's own charge (about A$63 on A$612). This is a pricing decision, not a copy fix, and it interacts with A2.

**A2. Is the platform fee charged on gross or net of Stripe's charges.** Decided 13 Sep: gross (worksheet 6). PRD-00 section 10 lists this as open and it is still open. The choice changes the payout arithmetic, the Fans payout table, the MRR tooltip and what patrons are told at checkout. Found by PRD-04.

**A3. Audio retention: 7 days or 90 days.** Decided 13 Sep: 7 days, fix the copy (worksheet 3). M-PRIV-1 deletes audio on transcript confirmation or after 7 days, whichever is first. The Match Scribe header badge, its help tip, the Connections pane and the Data & safety pane all say audio is kept 90 days in Cloudflare R2 with a "Delete all audio now" action. Found by PRD-02 and PRD-12; both follow the 7-day rule. A 90-day retention is defensible for re-transcription and dispute handling but needs to be a deliberate privacy choice, not an accident of two copy passes.

**A4. Pending prize money in the profit and loss.** Decided 13 Sep: fix the bug, M-DATA-2 stands (worksheet 7). M-DATA-2 says a prize receivable stays in the paying currency and does not enter reserves or income until the player marks it received. The prototype's September P&L counts the pending Genoa cheque as income. Found by PRD-03, which follows M-DATA-2. Fixing this changes the September figure the player sees.

**A5. Sign-in method.** Decided 13 Sep: magic link and passkey only (worksheet 11). M-ID-1 mandates magic link with optional passkey and no stored passwords. The `#/signin` route has a password field with `autocomplete="current-password"` and a reset link next to the magic-link option. Found by PRD-12, which follows M-ID-1. If passwords are wanted, M-ID-1 has to change and a credential-storage requirement has to be added.

**A6. Notification model.** Decided 13 Sep: two categories (worksheet 13). M-NOTIF-1 defines two categories, For you and FYI, with a cap of one For-you notification per agent run. The Settings notification matrix is organised by named event instead. Found by PRD-12. Either the matrix becomes two columns per agent, or M-NOTIF-1 becomes a per-event model and the cap is rewritten.

**A7. Content Agent publishing gate.** Decided 13 Sep: one tap on the card with the consequence sentence visible (worksheet 8). The dashboard card's "Approve & publish" publishes in one tap and toasts "Published to 11 patrons", while the Content Agent page uses a two-step confirm. M-GATE-2 requires the consequence sentence next to the approve control in both places. Found by PRD-05, which specifies two steps everywhere. One-tap publishing from the dashboard is the faster experience and a legitimate choice, but then the card needs the consequence sentence.

**A8. One draft per language.** Decided 13 Sep: single language in Release 1, M-LANG-3 to Release 2 (worksheet 9). M-LANG-3 says the Content Agent produces one version per language chosen in Preferences and each is approved separately. Preferences ships with English and Deutsch selected while the editor shows one draft and one approval. Found by PRD-05. Either the editor gains a language switcher with per-version approval, or Release 1 ships single-language drafts and M-LANG-3 moves to Release 2.

**A9. Fan Agent answer label.** Decided 13 Sep: permanent on unreviewed answers; a reply the player explicitly approved goes out as their own words (worksheet 10). PRD-10 makes "answered by the Fan Agent" a label that cannot be switched off, on the grounds that a patron must always know whether the player wrote it. The prototype builds it as a toggleable switch. Found by PRD-10. This is a trust decision and should not be left to a setting.

**A10. Fuel gating.** Decided 13 Sep: gate plainly (worksheet 15). PRD-00 gates Fuel to Pro and Elite. The quick-actions sheet offers "Scan a menu" to every tier and goes straight to the camera. Found by PRD-07. Either the sheet item shows the locked state on Free, or Fuel becomes a Free teaser with a scan limit.

**A11. Guardian flow for players under 18.** Decided 13 Sep: build before launch, hard blocker (see worksheet 1). M-ID-3 requires a guardian email at onboarding, the manager link sent to the guardian by default, and the public profile off by default. Step 1 of onboarding has a plain date-of-birth field and no such branch. Found by PRD-11. This is a child-safety requirement and should be built in Release 1 or the product should decline under-18 sign-ups until it is.

**A12. Unverified and ambiguous ranking match.** Decided 13 Sep: build both paths before launch (worksheet 2). M-ID-2 requires ambiguous matches to ask the player to choose, and unverified players to be able to proceed with a badge and no public profile. The prototype's lookup always resolves to one hard-coded match and the profile editor has no unverified state. Found by PRD-11.

**A13. Delete account cooling-off.** Decided 13 Sep: 14 days (worksheet 4). M-PRIV-2 requires a 14-day cooling-off period. The prototype promises an emailed confirmation link with no waiting period. Found by PRD-12.

**A14. Share-link expiry visibility.** Decided 13 Sep: show expiry with a Renew action (worksheet 12). M-SHARE-3 sets a 90-day expiry without renewal and requires it to be visible. The Sharing pane shows last-opened data and no countdown. Found by PRD-12.

**A15. Free tier and the Tournament Agent.** Decided 13 Sep: shortlist and Conditions brief on Free, rest locked (worksheet 14). PRD-00 section 10 already asks whether Free should see a read-only shortlist at all. PRD-08 sharpens it: with cost columns locked on Free, the Conditions brief becomes the only live content in the detail panel, which is an odd shape. Decide whether Free sees the shortlist, the brief, both or neither.

**A16. Mood chart window.** Decided 13 Sep: 30 and 90 days (worksheet 17). The brief called for a 12-week mood chart; the prototype offers 30 and 90 days. PRD-06 specifies 30 days and 12 weeks (84 days) and notes one of the two should change. A minor decision, but it affects the chart axis and the pattern window in section 7 of PRD-06.

**A17. Studio tier states.** Decided 13 Sep: deferred to Release 2 (worksheet 16). PRD-00 promises three states for Sponsor Agent and Fan Agent (none on Free, preview on Pro, early access on Elite) and M-TIER-4 requires an "Early access" badge with a feedback link. The prototype builds one static preview labelled "Elite · preview with sample data" with no feedback link. Found by PRD-09 and PRD-10.

**A18. Admin console: separate deployment or route group.** Decided 13 Sep: separate hostname on the same codebase with its own staff auth. PRD-13 assumes a separate hostname on the same codebase with staff sign-in (magic link plus mandatory passkey). TECH-ARCHITECTURE has not yet taken a position. Found by PRD-13. The blast radius of a staff-auth bug is the whole player base, which argues for the separate hostname.

**A19. Impersonation.** Decided 13 Sep: not in Release 1; revisit only with per-session consent and a banner if support volume demands it. PRD-13 rules out "view as the player" for Release 1 (AD-30) and specifies support working from the detail panel and the player's own audit log. If support volume proves it necessary it should require per-session player consent and a banner in both views. A product and privacy decision rather than a build one. Found by PRD-13.

**A20. Support visibility of per-player model spend.** Decided 13 Sep: visible to all console roles; the privacy trade-off is accepted and noted in PRD-13 section 12. The admin prototype shows model spend per player in the support-visible detail panel, which reveals how heavily a player uses Match Scribe. PRD-13 leaves it open whether that belongs to the owner role only. Found by PRD-13.

**A21. WTA players and doubles.** Raised by the synthetic dry run (SYNTHETIC-DRY-RUN.md section 4): the whole pack assumed ATP men's singles, three of eight personas were WTA players shown a men's build, and one doubles specialist found nothing for doubles. Decided 13 Sep by Manu Dubey: WTA players are in Release 1 with the stages mirroring the ATP thresholds (a Section D placeholder until research says otherwise); doubles is in Release 1 at the level of the doubles ranking chip and doubles prize money at the player's share, with draws, partners and doubles shortlists in Release 2. Cascaded to PRD-00 v0.4 (M-STG-3, M-STG-4), PRD-01, PRD-03, PRD-11, PRD-13, TECH-ARCHITECTURE v0.3. A WTA Stage 2 persona prototype is the next build.

---

## B. Prototype bugs and data errors

Status 13 Sep (v0.3 of both player files): B1 to B10, B12 to B20 fixed or already fixed on inspection; B11 left as static markup; B21 left as consistent with the Pro preview; B22 and B23 fixed in admin v0.2.1. Section C: C1, C3, C4 fixed; C2 already fixed on inspection; C5 moot while the profile has no allergies (the per-pick line is specified in PRD-07 FU-8 for build).

**B1. Conditions amber logic is wrong.** The Air tile tests `temp.startsWith('2')` and then reads `temp.slice(0,2)`, so it evaluates only the lower bound of a range. "24–29°C" never turns amber, and a single value such as "33°C" is never evaluated at all. PRD-08 specifies the forecast maximum. Fix the predicate.

**B2. Date inconsistency.** The Content Agent labels 11 September 2026 a Thursday while the app header and the Mindset Coach say "Sat 12 Sep". 11 September 2026 is a Friday. Found by PRD-05.

**B3. Patron join count disagrees with itself.** `drawFans` counts Chris O.'s upgrade as one of "3 joined" while the KPI reads "+2 this month". Found by PRD-04.

**B4. Average tenure figure.** The KPI shows 7.4 months; the mean tenure of the twelve patron records is about 10 months, and 92 percent retention cannot be derived from thirteen records. Both are illustrative and should either be computed or labelled. Found by PRD-04.

**B5. Budget vs actual.** The static markup reads "A$1,035 of A$1,200" while `renderBudget` recomputes A$1,445 and the over-budget state at boot. The computed value is the one specified. Found by PRD-03.

**B6. Runway claim does not compute.** "Adds 0.4 weeks of runway" for two more patrons works out to about 0.1 weeks at the stated MRR and burn. Found by PRD-03.

**B7. Word count flashes.** The Content Agent's static line reads "418 words · about 3 minutes to read" before the script replaces it with 197. Found by PRD-05.

**B8. Content history is not in date order.** 28 July sits between 21 August and 10 August. Found by PRD-05.

**B9. Skip reason is quoted but never collected.** The history quotes "nothing to say yet" as the player's reason while the Skip control never asks for one, and Undo reloads the page. Found by PRD-05.

**B10. Frames to bring can exceed frames carried.** The Antalya brief says bring 5 while the equipment profile defaults to 4. PRD-08's rule caps at frames carried, so either the profile goes to 5 or the brief adds the sub-line "you carry 4; bring them all".

**B11. Racquet legend is hard-coded.** The string line in the racquet visual does not read from the equipment profile. Found by PRD-08.

**B12. Fuel money model.** Logging a pick decrements reserves directly and writes a ledger line in A$ only, with no original currency, no rate and no source shown, against M-DATA-1 and M-CUR-1. The Sibiu line should carry 42 lei and the rate used. Rounding is also uneven (42 and 36 lei imply about 3.0 lei per A$, 28 lei implies 3.1). Found by PRD-07.

**B13. Fuel context chips point at screens that do not exist.** The dietary chip says "From onboarding" and its toast says "edit in Settings", but onboarding has no dietary step and Settings has no Fuel pane. The budget chip cites a "food line of this week's A$1,200 budget" while PRD-00 defines a weekly travel budget with no daily food line. Found by PRD-07.

**B14. Fuel continuity.** The Fuel scenario places Arya in Sibiu with a match against Petrov, while the rest of the prototype has her leaving Genoa after a Q2 loss on 11 September, Sibiu an undecided week 41 shortlist event, and Petrov the Genoa Q1 opponent she beat. Found by PRD-07.

**B15. Prize currency.** `PZ` stores the Genoa prize in A$ rather than euro, so the original-currency model cannot be demonstrated on the one row where it matters. Found by PRD-03.

**B16. Coach view shows a field nothing captures.** Match durations ("2h 41m") appear in the coach view while no Match Scribe field records a duration. Either the extractor proposes one or the row drops it. Found by PRD-02.

**B17. Em dashes in interface copy.** `renderCaHist` and several tables rendered an em dash as the empty-value marker, against the project writing rule. Fixed on 13 September: all twenty-two occurrences across the two player files are now en dashes. Found by PRD-05.

**B18. Country choice does not drive defaults.** The onboarding country select has no change handler, and Preferences always initialises to English, AUD and Metric regardless. The context material says currency, units, time zone and date format come from the country. Found by PRD-11 and PRD-12.

**B19. Sponsor Agent locked surface has two actions.** M-TIER-1 specifies one upgrade action on a locked surface; the studio bar shows "Upgrade to Elite" and "Finish your media kit first". Found by PRD-09.

**B20. Outreach approval lacks the consequence sentence.** M-GATE-2 requires one sentence stating what happens on approval; the outreach draft's footer names the sender but not the recipient or send time. Found by PRD-09.

**B21. Fan Q&A toggle and the preview disagree.** The profile's "Fan Q&A" toggle renders disabled and unchecked regardless of tier while `#/agent/fan` behaves as a live tappable Pro preview. Found by PRD-10.

**B22. Admin prototype fee tile assumes 8 percent on gross.** `procircuit-admin.html` shows A$1,412 as 8 percent of A$17,650 patron gross and flags A1 and A2 as open. Whichever way A1 and A2 go, the tile and its tooltip change. Found by PRD-13. Admin v0.2 now states the assumed basis on the Money page rather than only in a tooltip.

**B23. Overview attention count and alert badge differ.** The admin prototype's Overview sidebar badge shows the needs-action alert count (4) while the attention list holds five rows, because the past-due item is FYI. Either the badge counts rows or the fifth row moves to Money only. Found by PRD-13. Fixed 13 Sep in admin v0.2: the badge counts attention rows.

---

## C. Copy that overpromises

**C1. Transcription speed.** The prototype says "usually under 10 seconds"; PRD-00 section 6 requires under 20 seconds for a 60-second note. The copy should not promise 10. Found by PRD-02.

**C2. Photo retention.** Fuel says photos are "deleted within 24 hours"; M-PRIV-1 says menu photos are read once and deleted after extraction. Extraction is the deletion point and the copy should say so. Found by PRD-07.

**C3. Named model providers.** The prototype names Claude Sonnet in the Content Agent and GPT-4o mini in Fuel. PRD-00 section 7 names only a structured-output LLM and puts provider disclosure in Data & safety, which is the safer place for a list that will change. Found by PRD-05 and PRD-07.

**C4. Money and injuries rule.** The Content Agent's check "Nothing about money or injuries" passes a draft containing "a week of costs for a first-round cheque". The rule needs the precision given in PRD-05 section 7, or the check needs to fail. Found by PRD-05.

**C5. Allergen safety line missing.** The Fuel card promises that allergies are hard rules, but individual picks carry no confirm-with-the-kitchen line. PRD-07 requirement FU-8 adds it, and this should be treated as a safety requirement rather than copy polish. Found by PRD-07.

---

## D. Placeholders awaiting a number

These are constants the documents had to fix in order to be testable. Each was chosen to be plausible and each needs a real decision, ideally with players in the room.

Points value per ATP point, A$60, used in the cost-to-prize ratio (PRD-01). Acceptance thresholds of 10 places inside the cut for direct acceptance and 40 places outside for the alternate list (PRD-01). Mood-proposal confidence threshold 0.6 (PRD-02). Receipt extraction confidence threshold 0.8 (PRD-03). Weekly spend window of four weeks for the burn rate (PRD-03). Patron attention thresholds of three unopened updates, 30 days and 90 days (PRD-04). Pattern Strong threshold at a ratio of 0.6, memory similarity 0.82, and the distress lexicon per language (PRD-06). The one-kilogram tension test step, the frames ladder of 3, 4 and 5, the 400 m altitude threshold, the 10-point first-serve delta, and the 28°C and 70 percent condition thresholds (PRD-08). Regional deal benchmark range of A$3,000 to A$12,000 plus product (PRD-09). WTA stage thresholds mirroring the ATP figures of 800 and 450, and the 50 percent default doubles prize share (PRD-00 section 3, A21).

---

## E. Scope questions raised by the pack

Whether a stringer share scope belongs in Release 1, given the Conditions layer proposes tension tests that a stringer executes (PRD-08, PRD-00 section 10). Whether the ECB reference rate is acceptable for CNY or a market rate is needed (PRD-00 section 10, PRD-03). Whether the weekly budget is a hard filter or a soft ranking penalty (PRD-01). Whether Stage 3 players want ATP 250 qualifying in scope by default (PRD-01). Whether the Free note quota counts discarded notes that reached transcription, since the cost is incurred either way (PRD-02). Whether a waitlisted patron is invited automatically when someone leaves or only on the player's confirmation, and how a tier price change applies to existing patrons (PRD-04). Whether the Mindset Coach's distress card needs jurisdiction-specific review per launch country, and whether under-18 players should see youth-specific lines (PRD-06, PRD-00 section 10). Whether open tracking is reliable enough under mail privacy protections to drive the patron quiet flag at all (PRD-04). How acceptance lists are sourced reliably for ITF events where the cut is published late (PRD-01).

---

## F. Suggested order of resolution

The child-safety and identity items (A11, A12) and the privacy items (A3, A13) should be settled first because they gate launch in a way the others do not. The money items (A1, A2, A4) come next, since they change numbers the player and the patron both see and they touch Stripe configuration. The gate and label items (A7, A8, A9) follow, as they define the product's central promise that nothing leaves without a tap. The rest can be resolved during build. The prototype bugs in section B can be fixed in one pass and are mostly single-line changes; B1, B12 and B18 are the only ones with real logic behind them.
