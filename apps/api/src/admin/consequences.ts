// The one-sentence consequence shown next to every confirming control
// (PRD-13 AD-3, M-GATE-2 applied to staff). Built on the server from the
// player's current state, returned to the console for the confirmation
// step, and rebuilt at confirm time for the audit row, so the stored
// sentence is never whatever a client chose to send. Copy rule: amount or
// count, recipient, timing and reversibility.

export type PlayerActionType =
  | 'magic_link'
  | 'reverify'
  | 'trial_extend'
  | 'comp'
  | 'pause_agents'
  | 'resume_agents'
  | 'export_data'
  | 'delete_account'
  | 'cancel_deletion'
  | 'revoke_share_link'
  | 'offer_elite';

export const PLAYER_ACTION_TYPES: readonly PlayerActionType[] = [
  'magic_link',
  'reverify',
  'trial_extend',
  'comp',
  'pause_agents',
  'resume_agents',
  'export_data',
  'delete_account',
  'cancel_deletion',
  'revoke_share_link',
  'offer_elite',
];

/** Actions only the owner may take (PRD-13 section 2, AD-5, AD-23). */
export const OWNER_ONLY_ACTIONS: readonly PlayerActionType[] = [
  'comp',
  'delete_account',
  'offer_elite',
];

export const TRIAL_EXTENSION_DAYS = 14;
export const DELETION_COOLING_OFF_DAYS = 14;
export const COMP_DAYS = 30;

export interface ConsequencePlayer {
  name: string;
  email: string;
  tier: string | null;
  trialEndsAt: string | null;
  verification: string;
  deletionEffectiveAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thu 15 Oct 2026", in UTC (the dashboard's date-chip style, with the year). */
export function formatDay(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** AD-9: 14 days from the later of today and the current trial end. */
export function extendedTrialEnd(current: string | null, now: Date): Date {
  const base = current && new Date(current).getTime() > now.getTime() ? new Date(current) : now;
  return new Date(base.getTime() + TRIAL_EXTENSION_DAYS * DAY_MS);
}

export function deletionDate(now: Date): Date {
  return new Date(now.getTime() + DELETION_COOLING_OFF_DAYS * DAY_MS);
}

export function compEnd(now: Date): Date {
  return new Date(now.getTime() + COMP_DAYS * DAY_MS);
}

export function playerConsequence(
  action: PlayerActionType,
  player: ConsequencePlayer,
  now: Date,
  extra: { shareScope?: string | undefined; agentCount?: number } = {},
): string {
  const who = player.name;
  switch (action) {
    case 'magic_link':
      return `Emails one sign-in link to ${player.email} now. It works once and expires within the hour; nothing else changes.`;
    case 'reverify':
      return `Re-runs ${who}'s ranking verification against the current directory now. ${who} is notified only if the result changes.`;
    case 'trial_extend':
      return `Moves ${who}'s Pro trial end to ${formatDay(extendedTrialEnd(player.trialEndsAt, now))} and notifies ${who} now. Reversible by the owner.`;
    case 'comp':
      return `Gives ${who} Elite free until ${formatDay(compEnd(now))}, then returns them to ${player.tier ?? 'Free'}. ${who} is notified now; nothing is charged.`;
    case 'pause_agents':
      return `Pauses all ${extra.agentCount ?? 'of'} of ${who}'s agents now: no new proposals until resumed. Nothing already approved is undone, and ${who} is notified.`;
    case 'resume_agents':
      return `Resumes ${who}'s agents from their next scheduled run and notifies ${who} now.`;
    case 'export_data':
      return `Emails ${who}'s full export (notes, transcripts, expenses, check-ins) to ${player.email} now. Staff never see the file; this cannot be recalled.`;
    case 'delete_account':
      return `Starts the 14-day cooling-off: ${who}'s account is deleted on ${formatDay(deletionDate(now))} unless cancelled. ${who} is emailed at ${player.email} now and can cancel until then.`;
    case 'cancel_deletion': {
      const when = player.deletionEffectiveAt
        ? formatDay(new Date(player.deletionEffectiveAt))
        : 'the scheduled date';
      return `Cancels the deletion due ${when} and restores ${who}'s account now, at ${who}'s request. ${who} is notified.`;
    }
    case 'revoke_share_link':
      return `Revokes ${who}'s ${extra.shareScope ?? 'share'} link now: anyone opening it sees it has ended. ${who} can create a new one.`;
    case 'offer_elite':
      return `Sends ${who} one in-app offer to move to Elite, which lifts the 50-patron cap. Nothing is charged unless ${who} upgrades.`;
  }
}

export type PlatformActionType =
  | 'agent_pause'
  | 'agent_resume'
  | 'provider_switch'
  | 'run_retry'
  | 'run_dismiss'
  | 'case_resolve'
  | 'aggregation_run'
  | 'routing_update'
  | 'snapshot_apply'
  | 'correction_apply'
  | 'correction_reject'
  | 'deadline_set';
