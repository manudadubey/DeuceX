// Per-tier limits on the on-demand paths that spend a model call
// (TECH-ARCHITECTURE.md section 5's fourth fix, step 5.4; owner decision
// 26 September 2026). Counted per player over a rolling 24 hours in
// on_demand_requests. Free is already refused on every Pro-only path, so
// its row only covers what Free can reach (Match Scribe retries). Elite
// matches Pro until there's a reason for it not to.
export type OnDemandKind =
  'menu_scan' | 'receipt_scan' | 'content_rewrite' | 'patron_note_draft' | 'extraction_retry';

export type LimitTier = 'free' | 'pro' | 'elite';

const PRO_LIMITS: Record<OnDemandKind, number> = {
  menu_scan: 10,
  receipt_scan: 20,
  content_rewrite: 20,
  patron_note_draft: 20,
  extraction_retry: 5,
};

export const ON_DEMAND_LIMITS: Record<LimitTier, Record<OnDemandKind, number>> = {
  free: { ...PRO_LIMITS },
  pro: PRO_LIMITS,
  elite: PRO_LIMITS,
};

export const ON_DEMAND_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How each kind reads in a sentence ("10 menu scans"). */
export const ON_DEMAND_NOUNS: Record<OnDemandKind, string> = {
  menu_scan: 'menu scans',
  receipt_scan: 'receipt scans',
  content_rewrite: 'rewrites',
  patron_note_draft: 'patron note drafts',
  extraction_retry: 'note retries',
};

export function limitFor(tier: string | null, kind: OnDemandKind): number {
  const key: LimitTier = tier === 'pro' || tier === 'elite' ? tier : 'free';
  return ON_DEMAND_LIMITS[key][kind];
}
