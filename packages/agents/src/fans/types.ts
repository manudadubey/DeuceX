// PRD-04 section 6's data dictionary, in the shapes the deterministic Fans
// rules below read. Kept independent of packages/db's generated row types so
// every rule here is testable from a plain fixture (same reasoning as
// packages/agents/src/tournament/types.ts).

export type FansPlan = 'free' | 'pro' | 'elite';

export type PatronStatus = 'active' | 'past_due' | 'paused' | 'left';
export type PatronFlag = 'quiet' | 'card' | 'new' | 'none';
export type PatronSource = 'profile' | 'draw' | 'direct' | 'unknown';
export type PatronNoteKind = 'thanks' | 'nudge' | 'checkin' | 'welcome';

/** One of the last six updates delivered to a patron: 1 opened, 0 not opened, null not delivered (P-5). */
export type OpenMark = 1 | 0 | null;

export interface PatronRecord {
  id: string;
  name: string;
  tierId: string;
  status: PatronStatus;
  /** ISO timestamp. */
  since: string;
  /** ISO timestamp, set when status is left. */
  leftAt: string | null;
  leftReason: string | null;
  price: number;
  currency: string;
  opens: OpenMark[];
  cardFailedAt: string | null;
  cardRetryAt: string | null;
  source: PatronSource;
}

export interface PatronTierRecord {
  id: string;
  position: number;
  name: string;
  price: number;
  currency: string;
  perks: string;
}

/** A published patron update, from PRD-05 (step 4.2). Empty until the Content Agent exists. */
export interface PublishedUpdate {
  id: string;
  title: string;
  /** ISO timestamp. */
  sentAt: string;
}
