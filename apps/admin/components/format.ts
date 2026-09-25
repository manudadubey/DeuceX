// Display helpers for the console. Australian English, en-AU dates, mono
// figures in the markup. Money is A$ unless a currency is given.

export function aud(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return `A$${value.toLocaleString('en-AU', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function money(value: number, currency: string): string {
  try {
    return value.toLocaleString('en-AU', { style: 'currency', currency });
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return `${Math.round(value * 100)}%`;
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '–';
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 120) return `${s} s`;
  return `${Math.floor(s / 60)} m ${s % 60} s`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Never';
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

export const ACTION_LABELS: Record<string, string> = {
  magic_link: 'Sent a sign-in link',
  reverify: 'Re-ran ranking verification',
  trial_extend: 'Extended the trial',
  comp: 'Comped Elite',
  pause_agents: 'Paused agents',
  resume_agents: 'Resumed agents',
  export_data: 'Sent a data export',
  delete_account: 'Started account deletion',
  cancel_deletion: 'Cancelled account deletion',
  revoke_share_link: 'Revoked a share link',
  offer_elite: 'Offered Elite',
  agent_pause: 'Paused an agent',
  agent_resume: 'Resumed an agent',
  provider_switch: 'Switched a provider',
  run_retry: 'Retried a failed run',
  run_dismiss: 'Dismissed a failed run',
  case_resolve: 'Resolved a case',
  routing_update: 'Updated alert routing',
  snapshot_apply: 'Applied a ranking snapshot',
  correction_apply: 'Applied a fact-sheet correction',
  correction_reject: 'Rejected a fact-sheet correction',
  deadline_set: 'Set an entry deadline',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}
