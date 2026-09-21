import { describe, expect, it } from 'vitest';
import { mergePattern, type ExistingPattern } from './merge-patterns';
import type { PatternCandidate } from './rules';

function candidate(hits: number, total: number): PatternCandidate {
  const evidence = Array.from({ length: total }, (_, i) => ({
    noteId: `note-${i}`,
    hit: i < hits,
  }));
  return {
    ruleKey: 'tiebreak_loss_second_serve',
    kind: 'mental',
    tag: 'Second serve',
    statement: 'After a tiebreak loss, you write about rushing the second serve',
    explanation: 'Counted across match notes.',
    evidence,
  };
}

describe('mergePattern', () => {
  it('is new and flagged when there is no existing row', () => {
    const result = mergePattern(candidate(3, 4), undefined);
    expect(result.isNewOrStrengthened).toBe(true);
    expect(result.justReraised).toBe(false);
    expect(result.dismissed).toBe(false);
  });

  it('flags a strengthened pattern (more hits than before)', () => {
    const existing: ExistingPattern = {
      statement: 'x',
      explanation: 'y',
      evidence: candidate(3, 4).evidence,
      confidence: 'strong',
      dismissed: false,
      recurSince: 0,
    };
    const result = mergePattern(candidate(4, 5), existing);
    expect(result.isNewOrStrengthened).toBe(true);
  });

  it('does not flag an unchanged, already-live pattern', () => {
    const c = candidate(3, 4);
    const existing: ExistingPattern = {
      statement: c.statement,
      explanation: c.explanation,
      evidence: c.evidence,
      confidence: 'strong',
      dismissed: false,
      recurSince: 0,
    };
    const result = mergePattern(candidate(3, 4), existing);
    expect(result.isNewOrStrengthened).toBe(false);
  });

  it('MC-11: freezes a dismissed pattern below the re-raise threshold', () => {
    const dismissedAt = candidate(3, 4);
    const existing: ExistingPattern = {
      statement: dismissedAt.statement,
      explanation: dismissedAt.explanation,
      evidence: dismissedAt.evidence,
      confidence: 'strong',
      dismissed: true,
      recurSince: 0,
    };
    // Only one extra hit since dismissal (4 hits vs the 3 at dismissal time).
    const result = mergePattern(candidate(4, 5), existing);
    expect(result.dismissed).toBe(true);
    expect(result.recurSince).toBe(1);
    expect(result.justReraised).toBe(false);
    // Frozen: statement/evidence stay at the dismissal-time snapshot.
    expect(result.evidence).toEqual(dismissedAt.evidence);
  });

  it('MC-11/AC-6: re-raises with fresh evidence at two further supporting notes', () => {
    const dismissedAt = candidate(3, 4);
    const existing: ExistingPattern = {
      statement: dismissedAt.statement,
      explanation: dismissedAt.explanation,
      evidence: dismissedAt.evidence,
      confidence: 'strong',
      dismissed: true,
      recurSince: 0,
    };
    const fresh = candidate(5, 6);
    const result = mergePattern(fresh, existing);
    expect(result.dismissed).toBe(false);
    expect(result.justReraised).toBe(true);
    expect(result.isNewOrStrengthened).toBe(true);
    expect(result.recurSince).toBe(0);
    expect(result.evidence).toEqual(fresh.evidence);
  });
});
