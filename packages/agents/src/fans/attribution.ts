import { openSummary } from './attention';
import type { OpenMark, PatronSource, PublishedUpdate } from './types';

// P-6, P-7, P-21: the attribution sentence under each Last 30 days event.
// Deterministic templates over facts the webhook already has, so the same
// event always reads the same way and no model is in the loop.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** P-7: a join, upgrade or departure within seven days after an update's send time is attributed to it. */
export const ATTRIBUTION_WINDOW_DAYS = 7;

/** "Mira Kovač" -> "Mira K." (PRD-04 section 6: shown as "Mira K."). */
export function patronDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A patron';
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

export function patronFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** The most recent update sent at or before `at` and within the seven-day window, if any. */
export function attributedUpdate(
  updates: readonly PublishedUpdate[],
  atIso: string,
): PublishedUpdate | null {
  const at = new Date(atIso).getTime();
  let best: PublishedUpdate | null = null;
  for (const u of updates) {
    const sent = new Date(u.sentAt).getTime();
    if (sent > at || at - sent > ATTRIBUTION_WINDOW_DAYS * DAY_MS) continue;
    if (!best || sent > new Date(best.sentAt).getTime()) best = u;
  }
  return best;
}

function timingPhrase(update: PublishedUpdate, atIso: string): string {
  const sent = new Date(update.sentAt);
  const at = new Date(atIso);
  if (sent.toISOString().slice(0, 10) === at.toISOString().slice(0, 10)) {
    return 'Same day as the update';
  }
  const hours = Math.round((at.getTime() - sent.getTime()) / HOUR_MS);
  if (hours < 72) return `${hours} hours after "${update.title}"`;
  return `${Math.round(hours / 24)} days after "${update.title}"`;
}

/** P-21: the join source when the checkout referrer is known. */
export function sourcePhrase(source: PatronSource): string | null {
  if (source === 'profile') return 'came from your public profile';
  if (source === 'draw') return 'found you via a draw page link';
  if (source === 'direct') return 'came from a direct link';
  return null;
}

/** "48 hours after "Clay block, week two" · found you via a draw page link" */
export function joinAttribution(input: {
  atIso: string;
  source: PatronSource;
  updates: readonly PublishedUpdate[];
}): string {
  const update = attributedUpdate(input.updates, input.atIso);
  return [update ? timingPhrase(update, input.atIso) : null, sourcePhrase(input.source)]
    .filter((s): s is string => s !== null)
    .join(' · ');
}

/** An upgrade or downgrade: attributed to an update when one explains it, otherwise empty. */
export function tierMoveAttribution(input: {
  atIso: string;
  updates: readonly PublishedUpdate[];
}): string {
  const update = attributedUpdate(input.updates, input.atIso);
  return update ? `After "${update.title}"` : '';
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * "14 months. Opened every update until July. No reason given." The middle
 * sentence needs open data (PRD-05, step 4.2); until any update has been
 * delivered to this patron it is left out rather than invented.
 */
export function leaveAttribution(input: {
  tenureMonths: number;
  opens: readonly OpenMark[];
  lastOpenedAt: string | null;
  reason: string | null;
}): string {
  const parts: string[] = [input.tenureMonths === 1 ? '1 month.' : `${input.tenureMonths} months.`];
  const { delivered } = openSummary(input.opens);
  if (delivered > 0 && input.lastOpenedAt) {
    parts.push(`Opened every update until ${MONTHS[new Date(input.lastOpenedAt).getUTCMonth()]}.`);
  }
  const reason = input.reason?.trim();
  parts.push(reason ? `"${reason}"` : 'No reason given.');
  return parts.join(' ');
}

/** The event's headline, as the feed and the FYI notification both print it. */
export function eventTitle(input: {
  kind: 'join' | 'upgrade' | 'downgrade' | 'leave' | 'card_failed' | 'card_recovered';
  patronName: string;
  tierName: string;
}): string {
  const name = patronDisplayName(input.patronName);
  switch (input.kind) {
    case 'join':
      return `${name} joined ${input.tierName}`;
    case 'upgrade':
      return `${name} moved up to ${input.tierName}`;
    case 'downgrade':
      return `${name} moved down to ${input.tierName}`;
    case 'leave':
      return `${name} left ${input.tierName}`;
    case 'card_failed':
      return `${name}'s card payment failed`;
    case 'card_recovered':
      return `${name}'s card payment went through`;
  }
}
