import { describe, expect, it } from 'vitest';
import { computeConfidence, detectPatterns, type MindsetNote } from './rules';

const NOW = new Date('2026-09-21T10:00:00Z');

function note(overrides: Partial<MindsetNote> & { id: string }): MindsetNote {
  return {
    recordedAt: '2026-09-15T10:00:00Z',
    ctx: 'match',
    result: null,
    mood: null,
    tags: [],
    transcript: null,
    summary: null,
    cond: null,
    ...overrides,
  };
}

describe('detectPatterns · tiebreak loss -> second serve (MC-AC-3)', () => {
  it('finds the pattern at 3 of 4, Strong confidence', () => {
    const notes: MindsetNote[] = [
      note({ id: '1', result: 'L 6-4 3-6 6-7(5)', tags: ['Second serve'] }),
      note({ id: '2', result: 'L 7-6(4) 4-6 6-7(2)', tags: ['Second serve'] }),
      note({ id: '3', result: 'L 3-6 7-6(9)', tags: ['Second serve'] }),
      note({ id: '4', result: 'L 6-7(3) 5-7', tags: [] }),
      // Not a candidate: a straight-sets loss, no tiebreak.
      note({ id: '5', result: 'L 3-6 2-6', tags: ['Second serve'] }),
      // Not a candidate: outside the 90-day window.
      note({
        id: '6',
        result: 'L 6-7(1) 2-6',
        tags: ['Second serve'],
        recordedAt: '2026-01-01T10:00:00Z',
      }),
    ];

    const patterns = detectPatterns({ notes, timezone: 'Australia/Sydney', now: NOW });
    const tiebreak = patterns.find((p) => p.ruleKey === 'tiebreak_loss_second_serve');

    expect(tiebreak).toBeDefined();
    expect(tiebreak!.evidence).toHaveLength(4);
    expect(tiebreak!.evidence.filter((e) => e.hit)).toHaveLength(3);
    expect(computeConfidence(tiebreak!.evidence)).toBe('strong');
    expect(tiebreak!.statement).toBe(
      'After a tiebreak loss, you write about rushing the second serve',
    );
  });

  it('does not exist below three hits (MC-7)', () => {
    const notes: MindsetNote[] = [
      note({ id: '1', result: 'L 6-4 3-6 6-7(5)', tags: ['Second serve'] }),
      note({ id: '2', result: 'L 7-6(4) 4-6 6-7(2)', tags: [] }),
      note({ id: '3', result: 'L 3-6 7-6(9)', tags: [] }),
    ];

    const patterns = detectPatterns({ notes, timezone: 'Australia/Sydney', now: NOW });
    expect(patterns.find((p) => p.ruleKey === 'tiebreak_loss_second_serve')).toBeUndefined();
  });
});

describe('detectPatterns · travel -> flat next day', () => {
  it('finds the pattern at 5 of 6, Strong confidence', () => {
    const timezone = 'Australia/Sydney';
    const travelDays = [
      '2026-08-01',
      '2026-08-05',
      '2026-08-10',
      '2026-08-15',
      '2026-08-20',
      '2026-08-25',
    ];
    const notes: MindsetNote[] = travelDays.flatMap((day, i) => [
      note({ id: `travel-${i}`, ctx: 'travel', recordedAt: `${day}T09:00:00+10:00` }),
      note({
        id: `next-${i}`,
        ctx: 'other',
        mood: i < 5 ? 'flat' : 'confident',
        recordedAt: `${addDay(day)}T09:00:00+10:00`,
      }),
    ]);

    const patterns = detectPatterns({ notes, timezone, now: NOW });
    const travel = patterns.find((p) => p.ruleKey === 'travel_next_day_flat');

    expect(travel).toBeDefined();
    expect(travel!.evidence).toHaveLength(6);
    expect(travel!.evidence.filter((e) => e.hit)).toHaveLength(5);
    expect(computeConfidence(travel!.evidence)).toBe('strong');
  });
});

describe('detectPatterns · Conditions (physical, MC-8/AC-4 style)', () => {
  it('finds a first-serve drop in hot conditions, naming the stamp values', () => {
    const notes: MindsetNote[] = [
      note({ id: 'cool-1', cond: { firstServePct: 62, tempC: 22, humidityPct: 40 } }),
      note({ id: 'cool-2', cond: { firstServePct: 60, tempC: 24, humidityPct: 45 } }),
      note({ id: 'hot-1', cond: { firstServePct: 48, tempC: 33, humidityPct: 82 } }),
      note({ id: 'hot-2', cond: { firstServePct: 47, tempC: 31, humidityPct: 78 } }),
      note({ id: 'hot-3', cond: { firstServePct: 46, tempC: 34, humidityPct: 80 } }),
      // Not a hit: hot, but first-serve% barely moved from baseline.
      note({ id: 'hot-4', cond: { firstServePct: 58, tempC: 30, humidityPct: 81 } }),
    ];

    const patterns = detectPatterns({ notes, timezone: 'Australia/Sydney', now: NOW });
    const conditions = patterns.find((p) => p.ruleKey === 'conditions_first_serve_drop');

    expect(conditions).toBeDefined();
    expect(conditions!.kind).toBe('physical');
    expect(conditions!.tag).toBe('Conditions');
    expect(conditions!.evidence.filter((e) => e.hit)).toHaveLength(3);
    expect(conditions!.statement).toMatch(/34°C/);
    expect(conditions!.statement).toMatch(/82% humidity/);
  });

  it('never fires with no stamps at all (cond is always null until PRD-08/step 3.3)', () => {
    const notes: MindsetNote[] = [note({ id: '1' }), note({ id: '2' }), note({ id: '3' })];
    const patterns = detectPatterns({ notes, timezone: 'Australia/Sydney', now: NOW });
    expect(patterns.find((p) => p.ruleKey === 'conditions_first_serve_drop')).toBeUndefined();
  });
});

function addDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
