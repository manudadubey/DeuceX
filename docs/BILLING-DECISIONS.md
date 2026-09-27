# Billing decisions

DeuceX, prepared for Manu Dubey, 27 September 2026. All recommendations accepted by Manu Dubey on
27 September 2026, except GST and tax, which waits on the accountant. Corrected the same day: plans are priced and
billed in USD, not AUD (sections 2 and 5). Companion to PRD-00 section 4, PRD-11 section 12, PRD-12 section 4.4,
PRD-13 AD-9 and AD-22, and PRELAUNCH-CHECKLIST.md block C.

Real Stripe Billing for player subscriptions has been deferred since step 2.3. Today `players.tier`
is a plain column the player can write, onboarding sets `tier_status = 'trialing'` with no end
date, "Downgrade to Free" applies at once, and every "Start Pro trial" button shows a "coming soon"
toast. Before building, four questions need an answer, plus three smaller ones that billing forces.

The PRDs already settle more than expected. Where they do, this sheet says so and only asks
what's left.

## 1. The trial

**Already decided** (PRD-00 section 4, PRD-11 OB-11 and section 12): 14 days, no card up front,
the card is asked for on day 12 on Stripe's own page, and an unpaid trial reverts to Free on day 14
with nothing deleted (M-TIER-2). Support can extend a trial by 14 days (AD-9, already built).

**Conflict to resolve:** PRD-00 says "a trial of Pro". The onboarding wizard, as built, offers the
trial on Pro and Elite. Elite in Release 1 adds only unlimited patrons and the 5 percent fee (the
forecast and Agent Studio aren't built), so an Elite trial costs nothing extra to run.

**Open: how the trial is held.**

- **A. In DeuceX, no Stripe object until the player pays.** `trial_ends_at` is set at the tap; an
  hourly sweep reverts lapsed trials to Free. On day 12 the player goes to Stripe Checkout, which
  creates the subscription with its first charge dated to day 14. Stripe is only touched when the
  player chooses to pay, which is a natural approval. One wrinkle: Checkout needs the trial end a
  minimum time ahead (about 48 hours, to confirm when building), so a player paying on day 13 gets
  up to a day extra.
- **B. A Stripe no-card trial from the start.** Creates a Stripe customer and subscription for
  every sign-up at onboarding; Stripe cancels it on day 14 if no card arrived. Stripe owns the
  clock, but the lapse only reaches DeuceX by webhook, and there's no deployed webhook until
  `apps/api` is on Render.

**Open: how many trials.** One per player, ever (support can extend), or a fresh trial each time a
Free player taps "Start Pro trial".

**Recommendation:** A, one trial per player, available on Pro or Elite (keep what onboarding built
and correct PRD-00's wording). A Free player who skipped the trial at onboarding can start it later
from any "Start Pro trial" button. Reminder on day 12 by email and an in-app banner; notice on
day 14 when it lapses.

Decision record: Trial held in DeuceX (option A): `trial_ends_at` set at the tap, no Stripe object until the player pays through Checkout, first charge dated to day 14. One trial per player, ever; support can extend it. Available on Pro or Elite (PRD-00 wording corrected). A Free player can start it later from any "Start Pro trial" button. Day 12 email and in-app banner; day 14 lapse notice. Decided by: Manu Dubey Date: 27 September 2026

## 2. Annual pricing

**Already decided** (PRD-00 section 4): annual exists, at A$39 a month for Pro and A$119 for Elite.
The total must be stated at purchase (Australian Consumer Law, PRD-11 section 12).

**Error to fix:** the onboarding toggle says "Yearly · 2 months free". The real saving is larger:
Pro is A$468 a year against A$588 monthly (A$120, about 2.4 months); Elite is A$1,428 against
A$1,788 (A$360). The copy understates the discount, but it's still an inaccurate price claim.

**Open:**

- **Label:** "Save 20%" (true for both, rounded down), or change the prices so that "2 months
  free" is exact (A$490 and A$1,490 a year).
- **Cancelling an annual plan:** access runs to the end of the paid year with no pro-rata refund,
  or refund the unused months.
- **Renewal reminder:** email 7 days before an annual plan renews, or not.

**Recommendation:** keep the prices; change the label to "Save 20%" and show "A$468 billed yearly"
beside it. Annual cancellation runs to the end of the year, no pro-rata refund, said plainly at
purchase (statutory consumer guarantees still apply; support can refund case by case). Send the
7-day renewal reminder: a surprise A$1,428 charge is the fastest way to a chargeback.

**Correction, 27 September 2026 (owner):** plans move from AUD to USD, converting the AUD prices
at the ECB rate of 25 September 2026 (1 AUD = 0.7030 USD, from `fx_rates_daily`) and rounding to
whole dollars:

| Plan | AUD (was) | Exact USD | USD price | Yearly total | Saving vs monthly |
|---|---|---|---|---|---|
| Pro monthly | A$49 | US$34.45 | **US$34** | | |
| Pro yearly | A$39 a month | US$27.42 | **US$27 a month** | US$324 | US$84 (20.6%) |
| Elite monthly | A$149 | US$104.75 | **US$105** | | |
| Elite yearly | A$119 a month | US$83.66 | **US$84 a month** | US$1,008 | US$252 (20.0%) |

"Save 20%" stays true for both. The AUD figures above this correction are the analysis as first
written.

Decision record: Prices in USD: Pro US$34 a month or US$27 a month billed yearly (US$324); Elite US$105 a month or US$84 a month billed yearly (US$1,008). Label changes to "Save 20%" with the yearly total beside it. Cancelling an annual plan keeps access to the end of the paid year, no pro-rata refund, stated at purchase; support may refund case by case. Reminder email 7 days before an annual renewal. Decided by: Manu Dubey Date: 27 September 2026

## 3. Changing plans (proration)

Nothing is decided here beyond PRD-12's rule that a downgrade to Free takes effect at the end of
the period.

| Change | Options | Recommendation |
|---|---|---|
| Pro to Elite | Now, with a prorated charge today; now, with the difference added to the next invoice; or from the next period | **Now, prorated charge today**, with the exact amount in the confirmation sentence |
| Elite to Pro | Now, with a credit; or at period end | **At period end**, no credit, same as a downgrade to Free |
| Monthly to annual | Now, crediting the unused month; or at the next renewal | **Now, with credit**: the player is choosing to pay more up front |
| Annual to monthly | Now, with a refund; or at renewal | **At renewal** |
| Any change during the trial | Free, nothing has been charged | **Free** |

**Also open, forced by the patron cap:** Pro allows 50 patrons. When an Elite player with more
than 50 patrons moves to Pro:

- **A.** Block the downgrade until they're at 50 or under.
- **B.** Keep every existing patron, close the public page to new patrons (the waitlist, already
  built, takes them), and let the player reopen when under 50.
- **C.** Pause billing for the patrons above 50.

The platform fee also moves from 5 to 8 percent on the day Pro starts.

**Recommendation:** B, and the downgrade confirmation names both the patron count and the new
fee. C penalises fans for the player's plan choice.

Decision record: As the table's recommendations: Pro to Elite now with a prorated charge today; Elite to Pro and annual to monthly at period end; monthly to annual now, crediting the unused month; changes during the trial are free. Elite to Pro with more than 50 patrons: option B, every existing patron kept, the public page closes to new patrons (waitlist) until under 50; the confirmation names the patron count and the fee moving from 5 to 8 percent. Decided by: Manu Dubey Date: 27 September 2026

## 4. Failed payments

PRD-13 already assumes a "Past due" state that later lapses to Free (AD-22); the checklist wants
dunning emails through DeuceX's own email path in Baseline voice (C8). The length and the lapse
rule are open.

- **A. 14-day grace.** Stripe's Smart Retries try the card over 14 days. The player keeps full
  access with a "card declined" banner and a link to Stripe's portal. Emails on the first failure,
  day 7 and day 12. If the retries all fail, the subscription ends and the player moves to Free
  (M-TIER-2: nothing deleted).
- **B. 7-day grace.** Same shape, shorter.
- **C. Immediate.** Free on the first failure. Harsh for a player whose card is blocked
  abroad, which is common on tour.

**The hard part is patron billing.** M-TIER-2 says a move to Free pauses patron billing with a
notice to patrons. Today that pause is a gated action the player approves in the downgrade
confirmation (step 4.1b). A lapse for non-payment has no confirmation to approve, so:

- **i.** At lapse, pause patron billing automatically and send the notice, recorded as a system
  action under a rule you approve now. There's a precedent: step 4.1b's owner decision that a
  membership paused for 90 days ends automatically with a goodbye email.
- **ii.** Keep billing patrons and put a pending approval in front of the player. Fans keep paying
  for a programme the player may have walked away from, on a plan that doesn't include it.

**Recommendation:** A with i. Fourteen days suits a player who travels constantly; pausing
patrons automatically is the fair outcome for fans, and it's a narrow, named exception to "the
player authors every outward action", like the 90-day rule. If the player pays within 30 days of
lapsing, the plan comes back and they're offered a one-tap resume of patron billing (the gated
`patron_billing_resume`, already built).

Decision record: Option A with i: 14 days of Smart Retries with full access, a declined-card banner and emails on the first failure, day 7 and day 12; then the subscription ends and the player moves to Free with nothing deleted. At that lapse patron billing pauses automatically with the patron notice, recorded as a system action under this owner-approved rule (a named exception to player-authored approvals, like step 4.1b's 90-day rule). Paying within 30 days of the lapse restores the plan and offers a one-tap, gated `patron_billing_resume`. Decided by: Manu Dubey Date: 27 September 2026

## 5. Three smaller questions billing forces

**Billing currency.** PRD-00 says prices are "shown in home currency through Stripe"; checklist
C2 says the AUD amount is the billed figure. Options: bill in AUD and show an approximate
home-currency figure from the FX archive; turn on Stripe's Adaptive Pricing (the player pays in
their own currency, and Stripe's conversion charge falls on them); or set fixed EUR, USD and GBP
prices. **Recommendation:** bill in AUD with the approximate figure shown for launch, since it's
the smallest build and matches C2. Adaptive Pricing is a settings change later if players ask.

**GST and tax.** Whether the price includes GST for Australian players, and whether Stripe Tax
collects elsewhere, is for your accountant and the entity (checklist N3 and C1), not for this
sheet. The build can wait on it: Stripe prices are set tax-inclusive or tax-exclusive at creation.

**Existing "trialing" players.** Anyone who finished onboarding on Pro or Elite has
`tier_status = 'trialing'` and no end date. **Recommendation:** at switch-on, give each a fresh
14-day trial from that day, with an email saying so. Production holds only fixture players today,
so this matters only if a real player onboards first.

Decision record: bill in USD (owner correction, replacing the AUD recommendation), with an approximate home-currency figure from the FX archive; Adaptive Pricing possible later. GST still applies to Australian players whatever the billing currency. GST and tax: open, for the accountant (N3, C1); prices are created tax-inclusive or tax-exclusive once that's answered. Existing "trialing" players get a fresh 14-day trial from switch-on, with an email saying so. Decided by: Manu Dubey Date: 27 September 2026

## What building it involves (for scale, not a decision)

- `tier`, `tier_status` and `billing_cycle` stop being player-writable and are set only by the
  server, from Stripe (a column-grant migration, like step 2.3's).
- A subscriptions table, Checkout and portal sessions through `packages/actions` (still the only
  Stripe importer), approval rows for every plan change the player makes, webhook handling for
  renewals and failures, the trial sweep, the emails, and the real Plan & billing pane (C9).
- Renewals and failed payments only arrive by webhook, so they can be built and tested locally
  with the Stripe CLI but won't work in production until `apps/api` is deployed and
  `STRIPE_WEBHOOK_SECRET` is set. Trials under option 1A don't depend on that.
- Rough size: one full session for trials and Checkout, a second for plan changes, dunning and
  the Settings pane.
