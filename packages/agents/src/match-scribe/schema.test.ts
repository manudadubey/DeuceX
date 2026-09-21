import { describe, expect, it } from 'vitest';
import {
  MOOD_PROPOSAL_CONFIDENCE_THRESHOLD,
  RESULT_GRAMMAR,
  buildExtractionModelOutputSchema,
  buildProposal,
} from './schema';

const VOCABULARY = ['Second serve', 'Tiebreak', 'Clay'];

function validOutput(overrides: Record<string, unknown> = {}) {
  return {
    ctx: 'match',
    result: 'L 6-4 3-6 6-7(5)',
    opponent: 'D. Kovalenko',
    round: 'Q2',
    surface: 'clay',
    tags: ['Second serve', 'Tiebreak'],
    mood: 'confident',
    moodConfidence: 0.8,
    summary: 'Lost a tight three-setter, rushed the second serve under pressure.',
    ...overrides,
  };
}

describe('RESULT_GRAMMAR', () => {
  it.each(['L 6-4 3-6 6-7(5)', 'W 6-3 6-2', 'L 4-6'])('accepts %s', (value) => {
    expect(RESULT_GRAMMAR.test(value)).toBe(true);
  });

  it.each(['lost 6-4', 'L6-4', 'L 6-4-2', ''])('rejects %s', (value) => {
    expect(RESULT_GRAMMAR.test(value)).toBe(false);
  });
});

describe('buildExtractionModelOutputSchema', () => {
  it('accepts a well-formed extraction (S-AC-4)', () => {
    const schema = buildExtractionModelOutputSchema(VOCABULARY);
    const parsed = schema.safeParse(validOutput());
    expect(parsed.success).toBe(true);
  });

  it('rejects a result that does not match the grammar (S-7)', () => {
    const schema = buildExtractionModelOutputSchema(VOCABULARY);
    const parsed = schema.safeParse(validOutput({ result: 'Lost 6-4' }));
    expect(parsed.success).toBe(false);
  });

  it('rejects a tag outside the player vocabulary (S-10)', () => {
    const schema = buildExtractionModelOutputSchema(VOCABULARY);
    const parsed = schema.safeParse(validOutput({ tags: ['Second serve', 'Nutrition'] }));
    expect(parsed.success).toBe(false);
  });

  it('accepts null result, opponent, round and surface', () => {
    const schema = buildExtractionModelOutputSchema(VOCABULARY);
    const parsed = schema.safeParse(
      validOutput({ ctx: 'practice', result: null, opponent: null, round: null, surface: null }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects a summary over 220 characters', () => {
    const schema = buildExtractionModelOutputSchema(VOCABULARY);
    const parsed = schema.safeParse(validOutput({ summary: 'x'.repeat(221) }));
    expect(parsed.success).toBe(false);
  });

  it('rejects an out-of-range moodConfidence', () => {
    const schema = buildExtractionModelOutputSchema(VOCABULARY);
    const parsed = schema.safeParse(validOutput({ moodConfidence: 1.5 }));
    expect(parsed.success).toBe(false);
  });
});

describe('buildProposal', () => {
  const schema = buildExtractionModelOutputSchema(VOCABULARY);

  it('carries result, opponent, round and surface through for a Match note', () => {
    const output = schema.parse(validOutput());
    const proposal = buildProposal(output, { ctx: 'match' });
    expect(proposal).toMatchObject({
      result: 'L 6-4 3-6 6-7(5)',
      opponent: 'D. Kovalenko',
      round: 'Q2',
      surface: 'clay',
    });
  });

  it('nulls result, opponent, round and surface for a non-Match note (S-3)', () => {
    const output = schema.parse(validOutput({ ctx: 'practice' }));
    const proposal = buildProposal(output, { ctx: 'practice' });
    expect(proposal.result).toBeNull();
    expect(proposal.opponent).toBeNull();
    expect(proposal.round).toBeNull();
    expect(proposal.surface).toBeNull();
  });

  it('proposes mood at or above the confidence threshold', () => {
    const output = schema.parse(
      validOutput({ mood: 'confident', moodConfidence: MOOD_PROPOSAL_CONFIDENCE_THRESHOLD }),
    );
    const proposal = buildProposal(output, { ctx: 'match' });
    expect(proposal.mood).toBe('confident');
  });

  it('withholds mood below the confidence threshold (section 7)', () => {
    const output = schema.parse(validOutput({ moodConfidence: 0.59 }));
    const proposal = buildProposal(output, { ctx: 'match' });
    expect(proposal.mood).toBeNull();
  });

  it('never sets conditions: reserved for PRD-08 (step 3.3)', () => {
    const output = schema.parse(validOutput());
    const proposal = buildProposal(output, { ctx: 'match' });
    expect(proposal.conditions).toBeNull();
  });
});
