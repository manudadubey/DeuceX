-- Step 4.1b: the two Fans launch blockers step 4.1 named (PRD-04 P-17, P-18).
--
-- Only additive approvals.action_type values. Pausing and resuming patron
-- billing reach Stripe and email every paying patron on the player's behalf,
-- so each is a gated action with its own approval, the same as step 4.1's
-- connect_onboard and waitlist_invite:
-- * patron_billing_pause: "Downgrade to Free" pauses every paying patron's
--   subscription and emails each the notice the player saw in the confirm
--   step (P-18, M-TIER-2).
-- * patron_billing_resume: back on Pro or Elite, restarts those same
--   subscriptions without re-signup, with a notice to each patron.
-- The customer portal (P-17) is patron-initiated and needs no player
-- approval, so it adds nothing here: its emailed link is an HMAC-signed,
-- short-lived token checked in code, and patrons.status already allows
-- 'paused' (step 4.1).
alter table public.approvals drop constraint approvals_action_type_check;
alter table public.approvals add constraint approvals_action_type_check check (
  action_type in (
    'entry_confirm', 'expense_save', 'balance_update', 'patron_send',
    'content_publish', 'sponsor_send', 'retract', 'tier_change',
    'receivable_received', 'account_deletion_request', 'data_export_request',
    'connect_onboard', 'waitlist_invite',
    'patron_billing_pause', 'patron_billing_resume'
  )
);
