# ProCircuit pre-launch checklist

Version 0.1, 14 September 2026. Owner of the list: Manu Dubey.

This is everything ProCircuit needs that is not the product itself. The product pack (PRDs, prototypes, TECH-ARCHITECTURE, Baseline, BUILD-PLAN-CLAUDE-CODE) says what to build. This list says what has to be true around it before a real player can sign up, pay, and be paid. Each item has an owner, a suggested window, what it blocks, and a done test. Windows are counted from the day the founding engineer starts (week 1), which is also week 1 of Phase 0 in the build plan.

How to use it: work the "Now" block first, in order. Nothing in "Before first player" needs to exist before Phase 1 ships to a test player, and nothing in "Before charging" needs to exist before Stripe live mode is switched on. Move an item, not its dependencies.

Owner key: M = Manu (founder). L = lawyer (external). A = accountant (external). E = founding engineer. D = design (Baseline, currently the pack). S = whoever holds support and on-call (M until there is a second person).

---

## 0. Status at a glance

| Block | Items | Done | Gating |
|---|---|---|---|
| Now (weeks 1 to 2) | 8 | 0 | Everything below |
| Before engineering commits (weeks 1 to 4) | 7 | 0 | Phase 0 and 1 of the build |
| Before first player (weeks 8 to 12) | 11 | 0 | The first test player on Mindset Coach and Match Scribe |
| Before charging (weeks 12 to 16) | 9 | 0 | Stripe live mode, trial end, patron checkout |
| Before public launch (weeks 16 to 22) | 10 | 0 | Marketing site live, founding-player offer sent |
| After launch (ongoing) | 6 | 0 | none |

Tick the Done column in each table as items close. Record the date and any decision in the Notes column so the next reader does not have to ask.

---

## 1. Now (weeks 1 to 2)

The eight things that shape everything else. Two of them (the data licences and the company) have lead times measured in weeks, so they start first regardless of what else is happening.

| # | Item | Owner | Window | Blocks | Done when | Done | Notes |
|---|---|---|---|---|---|---|---|
| N1 | Open the ranking and calendar data conversation with the ATP, the WTA and the ITF (three bodies, three conversations). Ask specifically: commercial use of weekly singles and doubles rankings, calendar and entry-list data, and whether a player-uploaded CSV of their own ranking history is acceptable under the terms. | M | Week 1 | E2 feed integration, E5 Tournament Agent, the Free tier's ranking chart, Phase 3 of the build | A written reply from each body naming a licence path, a price or a refusal. The CSV question in TECH-ARCHITECTURE section 10 is answered. | | |
| N2 | Decide the launch markets by checking the expected player country list against Stripe Connect Express's supported countries. Players outside the list need a manual payout fallback or wait for Release 2. | M, then E | Week 1 | E7 Fans, payouts schema, patron checkout copy | A short list of supported and unsupported countries in TECH-ARCHITECTURE section 4, and a one-line rule for unsupported players in PRD-04. | | |
| N3 | Form the company (or confirm the existing JB Group entity carries ProCircuit), register the business name, open the bank account, register for GST. Stripe, the data licences and the app stores all need an entity. | M, A | Week 1 to 2 | N4, C1, C2, L3 | ABN and bank account exist and are named in this file. | | |
| N4 | Register the domain(s) and set up DNS, Google Workspace or equivalent for founder and support mail, and a sending domain for Resend (SPF, DKIM, DMARC). The admin console is a separate hostname (A18) so plan for `app.`, `admin.` and a bare marketing domain. | M, E | Week 1 to 2 | E0 auth (magic links need a sending domain), every email | Magic-link emails from the staging build land in the inbox, not spam, from the real domain. | | |
| N5 | Create the production and staging accounts: Supabase (two projects), Vercel (two projects, admin as a third), Sentry, Resend, Anthropic and OpenAI API keys with spend limits set, GitHub organisation. Store secrets in a password manager, not a spreadsheet. | E | Week 1 to 2 | Phase 0 step 0.1 | The CLAUDE.md MCP servers block in BUILD-PLAN-CLAUDE-CODE.md points at real projects. Monthly spend alerts are on for every account. | | |
| N6 | Hire or contract the founding engineer (or decide to build with Claude Code yourself). The build plan assumes one person can run Phase 0 and 1 with Claude Code; Phase 2 onward assumes three to five people. | M | Week 1 to 2 | Everything in the build plan | A named person, a start date, and the compensation shape (salary, contract or equity) written down. | | |
| N7 | Set the runway. Cost to build Release 1 is 45 to 49 engineering-weeks (TECH-ARCHITECTURE section 9) plus running costs of the stack, plus the data licences at whatever N1 returns. Decide whether this is self-funded, a small raise, or a smaller first release sold early. | M, A | Week 1 to 2 | N6, the Release 1 scope | A one-page budget with monthly burn, months of runway, and the trigger that would shrink scope to Phase 0 to 2 only. | | |
| N8 | Recruit the real research participants against the quotas in RESEARCH-KIT.md v0.2 (ATP, WTA, doubles, a parent-as-buyer, at least one player under 18 with a guardian present). Sessions run in weeks 3 to 6, so recruiting starts now. | M | Week 1 to 2 | R1 (research) | Eight to twelve confirmed sessions in a calendar, each tagged with the tour, stage and buyer type. | | |

---

## 2. Before engineering commits (weeks 1 to 4)

Things that change the build if they go the other way. They run in parallel with Phase 0.

| # | Item | Owner | Window | Blocks | Done when | Done | Notes |
|---|---|---|---|---|---|---|---|
| B1 | Legal review of the product rules that touch people: the guardian flow for under-18 players, the distress card and its escalation rule (PRD-06), the seven-day audio retention, the fourteen-day delete cooling-off, the Fan Agent label, and the real-person governance rule. Ask for the answer per jurisdiction the launch markets cover (N2). | L, M | Week 2 to 4 | E1, E3, E9, E11, E15 | A memo listing each rule, whether it stands, and any wording the lawyer wants in the product. Changes go into the PRDs and the review register as new items. | | |
| B2 | Privacy policy and a data map. The data map lists every table that holds personal data (TECH-ARCHITECTURE section 2), the retention for each, the processors (Supabase, Anthropic, OpenAI, Stripe, Resend, Sentry) and the region each stores in. The policy is written from the map, not the other way around. Cover the Australian Privacy Act, GDPR for EU players and the UK equivalent as a minimum. | L, E | Week 2 to 4 | First player (F1), app store review | Policy published at a URL, data map in the repo, Data Processing Agreements signed with each processor. | | |
| B3 | Terms of service for players, and separate patron terms for fans (what a tier buys, what it does not, refunds, the platform fee shown on gross with Stripe's fee separate, and that patron updates are written with agent help and approved by the player). | L | Week 2 to 4 | Charging (C1) | Both documents published, accepted at onboarding (players) and at checkout (patrons), with the acceptance stored against the account. | | |
| B4 | Run the real research sessions and write the synthesis in the RESEARCH-KIT format. Compare against the ten hypotheses in SYNTHETIC-DRY-RUN.md. | M | Week 3 to 6 | Phase 1 scope confirmation | A RESEARCH-SYNTHESIS.md in the folder, with each hypothesis marked supported, refuted or unclear, and any PRD changes logged in the review register. | | |
| B5 | Confirm the Release 1 scope after B4 and N1. If licensing is slow, the build plan already orders the manual ingestion path early; decide whether to launch on it. | M, E | Week 6 | Phase 2 onward | A dated note in PROCIRCUIT-CONTEXT.md section 12 saying what Release 1 contains and what moved. | | |
| B6 | Trademark search for "ProCircuit" and "Baseline" in Australia, the EU, the UK and the US, and social handles. File if clear; rename now if not, before the marketing site exists. | L, M | Week 2 to 4 | Marketing site (P1) | Search results filed, application lodged or a rename decided. | | |
| B7 | Insurance quotes: professional indemnity, cyber, and public liability at minimum. Some data licences and most app store agreements ask for it. | M, A | Week 3 to 4 | Charging (C1) | Policies bound or a dated decision to defer with the reason. | | |

---

## 3. Before first player (weeks 8 to 12)

The first player is a test player on Mindset Coach and Match Scribe (Phase 1 of the build). They are not paying. They are trusting you with match audio and mood data, so the items here are about not losing or leaking it.

| # | Item | Owner | Window | Blocks | Done when | Done | Notes |
|---|---|---|---|---|---|---|---|
| F1 | Privacy policy and terms live (B2, B3) and linked from onboarding and Settings. | E | Week 8 | First sign-up | Links resolve on staging and production. | | |
| F2 | Backup and restore drill. Take a Supabase point-in-time backup, restore it to a scratch project, sign in as a test player and confirm their file is intact. Time it. | E | Week 8 to 9 | First sign-up | The drill is written up (steps, time taken, what broke) in the repo's runbooks folder. Repeat quarterly. | | |
| F3 | Audio lifecycle proof. Record a test match note, confirm the file is deleted from storage at day seven and the transcript survives, and that a deleted account removes both. | E | Week 8 to 9 | First sign-up | An automated test in the repo, and a manual check on production storage. | | |
| F4 | Approval gate proof. With real Resend credentials on staging, show that no agent can send an email without an approvals row, and that the kill switch stops a queued run. This is E12's acceptance check run as a demonstration, not a unit test. | E | Week 8 to 9 | Any agent with side effects | A recorded run (screenshots or a short video) in the runbooks folder. | | |
| F5 | Support inbox and a support process. A shared mailbox, a target reply time (24 hours on weekdays is enough at this stage), and the admin console's player lookup as the first tool. Every support action goes through the console so it lands in `admin_actions`. | S | Week 9 | First sign-up | The address is in the product footer and Settings. A test ticket has gone through end to end. | | |
| F6 | Distress-case on-call. TECH-ARCHITECTURE section 10 leaves this as the owner holding it until there is a second person. Write down what "holding it" means: the alert route (PRD-13 alert routing), the response window, and the script, which is a pointer to local services in the player's country, never advice. | S, L | Week 9 | E9 Mindset Coach on production | The routing rule is configured in the console and a dry-run alert reached the on-call phone. | | |
| F7 | Incident and breach response procedure: who decides, who tells players, within what time (the Australian Notifiable Data Breaches scheme and GDPR 72 hours set the floor), and the template message. | M, L | Week 9 to 10 | First sign-up | A one-page runbook and a template in the repo. | | |
| F8 | Security pass on the staging build: row-level security review on every table in section 2, secret scanning in CI, dependency audit, rate limits on auth and upload endpoints, and the admin hostname behind staff auth with passkeys. Book an external penetration test for before public launch (P5). | E | Week 10 to 11 | First sign-up | Findings list with each item fixed or accepted, signed by M. | | |
| F9 | Analytics and consent. Decide the event list (the admin Overview needs it: sign-ups, activations, approvals, publishes, runs and cost), choose a privacy-respecting analytics tool, and put a consent notice up only if the tool or region needs one. Keep product analytics out of the transcript and mood tables. | E, M | Week 10 | Admin Overview accuracy | The event list is in the repo and the admin Overview shows real numbers on staging. | | |
| F10 | Status page and uptime checks on the app, the admin hostname and the feed jobs. | E | Week 11 | First sign-up | The status page is linked from the footer; a synthetic check alerts within five minutes of an outage. | | |
| F11 | Founding-player agreement: a short plain-language note for test players saying what they get (free access, a say in the product), what you will do with their data (the policy), and that features will break. | M, L | Week 11 to 12 | First sign-up | Sent and acknowledged by each test player. | | |

---

## 4. Before charging (weeks 12 to 16)

Stripe live mode, the end of the 14-day trial, and patron checkout all turn on here. Nothing in this block should be done in a hurry.

| # | Item | Owner | Window | Blocks | Done when | Done | Notes |
|---|---|---|---|---|---|---|---|
| C1 | Stripe live account with the entity from N3, Connect Express platform approval, tax settings (GST on subscriptions for Australian players, the rest by Stripe Tax or a decision not to collect), and payout schedule. | M, A, E | Week 12 to 13 | Trial end, patron checkout | A real A$1 subscription and a real A$5 patron payment have gone through and been refunded, and the ledger, `payouts` row and admin Money page all agree. | | |
| C2 | Pricing page copy checked against PRD-00 and the patron terms: A$49 and A$39, A$149 and A$119, the 8 and 5 percent fee on gross with Stripe separate, the 50-patron cap on Pro, the trial with no card. Prices shown in the player's currency use the FX archive, with the AUD amount as the billed figure. | M, D | Week 13 | Marketing site (P1) | Copy signed off and matching the checkout screen exactly. | | |
| C3 | Money model acceptance tests from PRD-00 (currency switch, receivable stays out of reserves, provisional then final FX) running green in CI. | E | Week 13 to 14 | Charging | The tests are in the repo and referenced in the review register. | | |
| C4 | Refund and dispute process: who can refund (an admin console action with a reason), the policy text, and how a Stripe dispute is handled within its deadline. | S, A | Week 14 | Charging | A refund has been issued through the console on staging and appears in `admin_actions`. | | |
| C5 | Invoicing and accounting feed: Stripe to the accounting system, monthly reconciliation of MRR, fees and payouts against the admin Money page. | A, E | Week 14 to 15 | First month end | The first reconciliation is done and the differences are explained. | | |
| C6 | Manual payout fallback for players in countries Connect Express does not cover (from N2), or a clear message that patron income is not available there yet. | M, E | Week 15 | Patron checkout in those countries | The rule is in PRD-04 and the product shows it before a patron can pay. | | |
| C7 | Unit-economics instrumentation live: real per-run model cost on the admin Overview and per player (A20), with the A$7.35 cap as a visible line. | E | Week 15 | Pricing confidence | A week of real data on the chart. | | |
| C8 | Trial-end and dunning emails through the approval-gated email path, with copy in Baseline voice. | E, D | Week 15 to 16 | Trial end | Emails previewed in both themes and both a successful and a failed payment have been walked through on staging. | | |
| C9 | Player-facing billing surface in Settings: plan, next invoice, invoices to download, cancel with the consequence sentence. | E | Week 16 | Charging | Present on production and covered by the PRD-12 acceptance checks. | | |

---

## 5. Before public launch (weeks 16 to 22)

| # | Item | Owner | Window | Blocks | Done when | Done | Notes |
|---|---|---|---|---|---|---|---|
| P1 | Marketing site in Baseline: home, how it works (the three answers), pricing (C2), for coaches and parents, about, privacy and terms, sign-in. Built on the same tokens as the app so the first screen and the dashboard match. | D, E | Week 16 to 19 | Launch | Live on the bare domain, passes the same 1440, 1024 and 390 sweep as the prototypes, and Lighthouse accessibility at 100. | | |
| P2 | Help centre: ten articles covering onboarding and verification, the two verification paths, the guardian flow, Match Scribe and audio retention, the approval gate ("why does ProCircuit ask before it acts"), patron payouts and fees, share links and renewal, deleting your account, notifications, and languages. | M, D | Week 17 to 19 | Launch | Articles live and linked from the relevant Settings panes and from the console's support lookup. | | |
| P3 | Founding-player offer and outreach list: who the first thirty players are, how you reach each (coach, academy, federation, direct), the offer (founding price or extended trial), and the message in Baseline voice. | M | Week 17 to 18 | Launch | The list exists with a status column, and the message is written. | | |
| P4 | Public-profile and share-link review for the real-person rule: no photo without a licence, only public facts about real players, share links expire and renew. | M, L | Week 18 | Launch | A sample of real profiles reviewed and signed off. | | |
| P5 | External penetration test on production, findings fixed or accepted. | E | Week 18 to 20 | Launch | The report and the fix list are in the runbooks folder. | | |
| P6 | Load and cost rehearsal: simulate one hundred players' scheduled agent runs for a week on staging and confirm the queue, the cost cap and the kill switch behave. | E | Week 19 | Launch | A written result with peak queue depth, cost per player-week and any throttling that fired. | | |
| P7 | App store accounts (Apple Developer, Google Play) if the mobile shells in Phase 5 ship as wrapped apps; otherwise a decision to launch as a web app with home-screen install and revisit after launch. | M, E | Week 19 to 20 | Mobile launch | Accounts exist and a build has passed review, or the decision is dated in PROCIRCUIT-CONTEXT.md. | | |
| P8 | Launch communications: an announcement for the founding players, a coach and academy note, and a press-style page for tennis media. No claims about ranking outcomes; the product shows where a player lands if they play the calendar they chose. | M | Week 20 to 21 | Launch | Drafts approved and scheduled. | | |
| P9 | Runbooks complete: deploy and rollback, feed failure and the manual ingestion path, Stripe webhook replay, kill switch, distress-case alert, data request handling, account deletion after the cooling-off. | E, S | Week 20 to 21 | Launch | Each runbook has been walked through once by someone other than its author. | | |
| P10 | Go and no-go review against this list, with every open item either closed or accepted with a name and a date. | M | Week 22 | Launch | A dated note in PROCIRCUIT-CONTEXT.md section 12. | | |

---

## 6. After launch (ongoing)

| # | Item | Owner | Cadence | Done when | Notes |
|---|---|---|---|---|---|
| O1 | Weekly review of the admin Overview: attention rows, approval rate, failed runs, model spend against the cap. | M | Weekly | A short note each week in a running log. | |
| O2 | Monthly reconciliation (C5) and a runway update (N7). | A, M | Monthly | Reconciled and the budget updated. | |
| O3 | Quarterly backup and restore drill (F2) and dependency audit (F8). | E | Quarterly | Written up in the runbooks folder. | |
| O4 | Data licence renewals and any usage reporting the tours require (from N1). | M | As per licence | Calendar reminders set at ninety days before each renewal. | |
| O5 | Second person on support and on-call (F5, F6), then a rotation. | M | When the player count or hours justify it | The routing rule in the console names two people. | |
| O6 | Research cadence: a round of sessions each release using RESEARCH-KIT.md, with the synthesis in the folder. | M | Each release | RESEARCH-SYNTHESIS-Rn.md exists. | |

---

## 7. Dependencies drawn out

The chains that matter, so the order above is not arbitrary:

N3 (entity) is needed by N4 (domain and mail are easier in the company's name), C1 (Stripe live), N1 (licences are signed by an entity) and B7 (insurance).

N1 (data licences) gates E2 in the build and therefore E5 and E6. The manual ingestion path in E18 is the hedge, which is why the build plan sequences it early.

N2 (launch markets) gates C6 and the patron checkout copy, and feeds B1 and B2 (which jurisdictions the lawyer covers).

B2 and B3 (policy and terms) gate F1 and therefore the first player. Start them in week 2 because lawyers take longer than engineers.

B4 (real research) can change Phase 1 scope, so it should finish before Phase 2 starts, not before Phase 0.

F4 (gate proof) and F8 (security pass) are what make it safe to connect real Resend and Stripe keys, so they sit before C1.

---

## 8. What this list does not cover

The build itself (BUILD-PLAN-CLAUDE-CODE.md), the product rules (PRDs and the review register), the design rules (Baseline), and the technical risks (TECH-ARCHITECTURE section 10). If an item here changes one of those, log it in PRD-REVIEW-REGISTER.md and update the source document rather than annotating this list.
