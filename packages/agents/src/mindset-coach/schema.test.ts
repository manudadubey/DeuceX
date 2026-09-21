import { describe, expect, it } from 'vitest';
import { insightModelOutputSchema, runToneCheck } from './schema';

describe('insightModelOutputSchema', () => {
  it('accepts a body within 8-90 words and a focus', () => {
    const result = insightModelOutputSchema.safeParse({
      body: [
        'Three of your last four notes after a tiebreak loss mention rushing the second serve.',
      ],
      focus: 'Hit ten deliberately slow second serves before anything else today.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a null focus (feedback-adaptation, section 7)', () => {
    const result = insightModelOutputSchema.safeParse({
      body: ['A quiet week of solid practice notes, nothing dramatic either way.'],
      focus: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a body under the word floor', () => {
    const result = insightModelOutputSchema.safeParse({ body: ['Too short.'], focus: 'Go.' });
    expect(result.success).toBe(false);
  });

  it('rejects more than three sentences', () => {
    const result = insightModelOutputSchema.safeParse({
      body: ['One.', 'Two.', 'Three.', 'Four sentences is one too many for this schema.'],
      focus: 'Go.',
    });
    expect(result.success).toBe(false);
  });
});

describe('runToneCheck · MC-4/AC-11', () => {
  it('passes ordinary player-voiced prose', () => {
    const result = runToneCheck({
      body: [
        'Three of your last four notes after a tiebreak loss mention rushing the second serve.',
      ],
      focus: 'Slow the toss down on big points today.',
    });
    expect(result.passed).toBe(true);
    expect(result.flaggedTerms).toEqual([]);
  });

  it('fails on "depression" (AC-11)', () => {
    const result = runToneCheck({
      body: ['This reads like a symptom of depression building over the last few weeks.'],
      focus: null,
    });
    expect(result.passed).toBe(false);
    expect(result.flaggedTerms.length).toBeGreaterThan(0);
  });

  it('fails on other blocklisted clinical terms', () => {
    for (const term of ['burnout', 'diagnosis', 'anxiety disorder', 'symptom']) {
      const result = runToneCheck({ body: [`This looks like ${term} to me.`], focus: null });
      expect(result.passed).toBe(false);
    }
  });
});
