import { computeConfidence, type PatternCandidate, type PatternConfidence } from './rules';

// The `patterns` row this run already knows about for a given rule_key
// (packages/db/migrations/20260921110000_step_1_3_mindset_coach.sql). Shaped
// like the DB row (camelCase) rather than re-deriving it, since the caller
// (apps/api) has the row already and this function's whole job is deciding
// what to write back over it.
export interface ExistingPattern {
  statement: string;
  explanation: string;
  evidence: PatternCandidate['evidence'];
  confidence: PatternConfidence;
  dismissed: boolean;
  recurSince: number;
}

export interface PatternMergeResult {
  ruleKey: string;
  kind: PatternCandidate['kind'];
  tag: string;
  statement: string;
  explanation: string;
  evidence: PatternCandidate['evidence'];
  confidence: PatternConfidence;
  dismissed: boolean;
  recurSince: number;
  /** MC-11: "re-raise it only after two further supporting notes." */
  justReraised: boolean;
  /** Drives insights.pattern_flag (section 3: "a pattern flag when a pattern is new or strengthened"). */
  isNewOrStrengthened: boolean;
}

const RERAISE_THRESHOLD = 2;

// MC-11 / section 7's dismissal rule. A candidate this run either:
// - is brand new (no existing row): written live, flagged.
// - already exists and isn't dismissed: updated live; flagged only if it
//   gained hits or crossed into Strong confidence ("new or strengthened").
// - already exists and IS dismissed: frozen at its dismissal-time statement/
//   evidence/confidence (never silently overwritten while dismissed — see
//   rules.ts's own module comment on why this function receives the row,
//   not just the candidate) while `recurSince` counts qualifying hits beyond
//   what was known at dismissal; at two, it unfreezes and re-raises with the
//   fresh candidate as evidence.
export function mergePattern(
  candidate: PatternCandidate,
  existing: ExistingPattern | undefined,
): PatternMergeResult {
  const confidence = computeConfidence(candidate.evidence);
  const hitCount = candidate.evidence.filter((e) => e.hit).length;

  if (!existing) {
    return {
      ...candidate,
      confidence,
      dismissed: false,
      recurSince: 0,
      justReraised: false,
      isNewOrStrengthened: true,
    };
  }

  if (!existing.dismissed) {
    const existingHitCount = existing.evidence.filter((e) => e.hit).length;
    const strengthened =
      hitCount > existingHitCount ||
      (existing.confidence === 'emerging' && confidence === 'strong');
    return {
      ...candidate,
      confidence,
      dismissed: false,
      recurSince: 0,
      justReraised: false,
      isNewOrStrengthened: strengthened,
    };
  }

  const dismissedHitCount = existing.evidence.filter((e) => e.hit).length;
  const extraHits = Math.max(0, hitCount - dismissedHitCount);

  if (extraHits >= RERAISE_THRESHOLD) {
    return {
      ...candidate,
      confidence,
      dismissed: false,
      recurSince: 0,
      justReraised: true,
      isNewOrStrengthened: true,
    };
  }

  // Frozen: the candidate's freshly computed fields are discarded in favour
  // of what the pattern read like at dismissal, so the player's "Not a
  // pattern" tap sticks until it genuinely earns its way back.
  return {
    ruleKey: candidate.ruleKey,
    kind: candidate.kind,
    tag: candidate.tag,
    statement: existing.statement,
    explanation: existing.explanation,
    evidence: existing.evidence,
    confidence: existing.confidence,
    dismissed: true,
    recurSince: extraHits,
    justReraised: false,
    isNewOrStrengthened: false,
  };
}
