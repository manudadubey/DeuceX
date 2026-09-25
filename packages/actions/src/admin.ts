import type { EmailClient } from './resend-client';

// The admin-action gate (PRD-13 AD-3 to AD-5; owner decision 25 September
// 2026). A player-facing side effect started by staff (an email about the
// player's own account, a sign-in link, an export) runs only after the
// admin_actions row that records it (who, which role, the consequence
// sentence shown at confirmation, and the reason where AD-5 needs one) has
// been written and is then claimed exactly once. It is the staff twin of
// runGatedAction: that gate needs a player-authored approvals row; this one
// needs an accountable staff row. Nothing here can publish, pay patrons,
// enter a tournament or message patrons, sponsors or fans: those stay
// player-only (PRD-13 section 3, "Approval gate").

/** AD-5: these action types need a written reason before they can run (mirrors admin_actions_reason_required). */
export const REASON_REQUIRED_ADMIN_ACTIONS = [
  'delete_account',
  'comp',
  'refund',
  'snapshot_apply',
  'provider_switch',
] as const;

export type AdminRole = 'support' | 'ops' | 'owner';

export interface AdminActionRecord {
  id: string;
  adminId: string;
  playerId: string | null;
  actionType: string;
  reason: string | null;
}

export interface AdminActionGateDb {
  getAdminAction(adminActionId: string): Promise<AdminActionRecord | null>;
  /** Atomically claims the action (admin_action_consumptions' primary key). False if already claimed. */
  claimAdminAction(adminActionId: string): Promise<boolean>;
}

export class AdminActionNotFoundError extends Error {
  constructor(readonly adminActionId: string) {
    super(`No admin action ${adminActionId} on record`);
    this.name = 'AdminActionNotFoundError';
  }
}

export class AdminActionMismatchError extends Error {
  constructor(
    readonly adminActionId: string,
    readonly detail: string,
  ) {
    super(`Admin action ${adminActionId} does not match: ${detail}`);
    this.name = 'AdminActionMismatchError';
  }
}

export class AdminActionAlreadyConsumedError extends Error {
  constructor(readonly adminActionId: string) {
    super(`Admin action ${adminActionId} has already run`);
    this.name = 'AdminActionAlreadyConsumedError';
  }
}

export class AdminReasonRequiredError extends Error {
  constructor(readonly actionType: string) {
    super(`"${actionType}" needs a written reason (PRD-13 AD-5)`);
    this.name = 'AdminReasonRequiredError';
  }
}

export function reasonRequired(actionType: string): boolean {
  return (REASON_REQUIRED_ADMIN_ACTIONS as readonly string[]).includes(actionType);
}

export interface RunAdminGatedActionInput {
  adminActionId: string;
  playerId: string | null;
  actionType: string;
}

export async function runAdminGatedAction<T>(
  db: AdminActionGateDb,
  input: RunAdminGatedActionInput,
  sideEffect: () => Promise<T>,
): Promise<T> {
  const action = await db.getAdminAction(input.adminActionId);
  if (!action) throw new AdminActionNotFoundError(input.adminActionId);
  if (action.actionType !== input.actionType) {
    throw new AdminActionMismatchError(
      input.adminActionId,
      `recorded as "${action.actionType}", not "${input.actionType}"`,
    );
  }
  if (action.playerId !== input.playerId) {
    throw new AdminActionMismatchError(input.adminActionId, 'recorded for a different player');
  }
  if (reasonRequired(action.actionType) && !action.reason?.trim()) {
    throw new AdminReasonRequiredError(action.actionType);
  }

  // Claim before the side effect, same direction as runGatedAction: a
  // failed send leaves the action consumed rather than replayable.
  const claimed = await db.claimAdminAction(input.adminActionId);
  if (!claimed) throw new AdminActionAlreadyConsumedError(input.adminActionId);

  return sideEffect();
}

// ---------------------------------------------------------------------------
// Staff-triggered player emails. Each takes the admin action id first, like
// every approval-gated function here takes an approval id first.
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export interface StaffDeletionEmailInput {
  adminActionId: string;
  playerId: string;
  playerEmail: string;
  effectiveAt: string;
  /** Server-configured player app origin, never client-supplied. */
  appBaseUrl: string;
}

/** AD-11: a console-started deletion emails the player at once, with the way to cancel. */
export async function sendStaffDeletionStartedEmail(
  gateDb: AdminActionGateDb,
  email: EmailClient,
  input: StaffDeletionEmailInput,
): Promise<void> {
  await runAdminGatedAction(
    gateDb,
    { adminActionId: input.adminActionId, playerId: input.playerId, actionType: 'delete_account' },
    async () => {
      const cancelUrl = `${input.appBaseUrl}/settings?pane=data`;
      await email.sendEmail({
        to: input.playerEmail,
        subject: 'Your DeuceX account is scheduled for deletion',
        html: `<p>DeuceX support has started deleting your account, as requested.</p>
<p>Your account and everything in it will be deleted on ${escapeHtml(formatDate(input.effectiveAt))}. Until then it is paused, and you can cancel at any time.</p>
<p><a href="${cancelUrl}">Cancel the deletion</a> (Settings, Data and safety). If you didn't ask for this, reply to this email and support will restore your account.</p>`,
      });
    },
  );
}

export interface PlayerSignInLinkInput {
  adminActionId: string;
  playerId: string;
  playerEmail: string;
  /** Built server-side from Supabase's generated token hash and the player app origin. */
  signInUrl: string;
}

/** AD-9: support sends a player a magic link (for example when their own email went to spam). */
export async function sendPlayerSignInLink(
  gateDb: AdminActionGateDb,
  email: EmailClient,
  input: PlayerSignInLinkInput,
): Promise<void> {
  await runAdminGatedAction(
    gateDb,
    { adminActionId: input.adminActionId, playerId: input.playerId, actionType: 'magic_link' },
    async () => {
      await email.sendEmail({
        to: input.playerEmail,
        subject: 'Your DeuceX sign-in link',
        html: `<p>DeuceX support sent you a link to sign in.</p>
<p><a href="${input.signInUrl}">Sign in to DeuceX</a></p>
<p>The link works once and expires within the hour. If you didn't ask support for this, you can ignore it.</p>`,
      });
    },
  );
}

/** Staff's own console sign-in link. Not player-facing, so not behind the admin gate. */
export async function sendStaffSignInLink(
  email: EmailClient,
  input: { to: string; signInUrl: string },
): Promise<void> {
  await email.sendEmail({
    to: input.to,
    subject: 'Sign in to the DeuceX console',
    html: `<p><a href="${input.signInUrl}">Sign in to the DeuceX console</a></p>
<p>The link works once and expires within the hour. A registered passkey is still required.</p>`,
  });
}
