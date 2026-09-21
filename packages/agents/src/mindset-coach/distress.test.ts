import { describe, expect, it } from 'vitest';
import { evaluateDistress, matchesDistressLexicon } from './distress';
import type { MindsetCheckIn, MindsetNote } from './types';

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

function checkIn(overrides: Partial<MindsetCheckIn> & { date: string }): MindsetCheckIn {
  return { value: 3, sentence: null, ...overrides };
}

describe('matchesDistressLexicon', () => {
  it('matches self-harm and hopelessness phrasing', () => {
    expect(matchesDistressLexicon("I don't want to keep going")).toBe(true);
    expect(matchesDistressLexicon('Everything feels hopeless right now')).toBe(true);
  });

  it('does not false-positive on ordinary tennis frustration', () => {
    expect(matchesDistressLexicon('I want to quit this tournament, my serve is a mess')).toBe(
      false,
    );
    expect(matchesDistressLexicon('So frustrated with my second serve today')).toBe(false);
  });
});

describe('evaluateDistress · M-PRIV-3', () => {
  it('fires on a lexicon match in a note transcript', () => {
    const result = evaluateDistress({
      notes: [note({ id: '1', transcript: "I don't want to be here anymore" })],
      checkins: [],
    });
    expect(result.fired).toBe(true);
    expect(result.signals).toContain('lexicon_note');
  });

  it('fires on a lexicon match in a check-in sentence (MC-AC-10)', () => {
    const result = evaluateDistress({
      notes: [],
      checkins: [
        checkIn({ date: '2026-09-20', sentence: 'no point in going on with any of this' }),
      ],
    });
    expect(result.fired).toBe(true);
    expect(result.signals).toContain('lexicon_checkin');
  });

  it('fires on three consecutive check-ins of 1', () => {
    const result = evaluateDistress({
      notes: [],
      checkins: [
        checkIn({ date: '2026-09-18', value: 1 }),
        checkIn({ date: '2026-09-19', value: 1 }),
        checkIn({ date: '2026-09-20', value: 1 }),
      ],
    });
    expect(result.fired).toBe(true);
    expect(result.signals).toEqual(['three_consecutive_low_checkins']);
  });

  it('does not fire on three low check-ins with one break', () => {
    const result = evaluateDistress({
      notes: [],
      checkins: [
        checkIn({ date: '2026-09-18', value: 1 }),
        checkIn({ date: '2026-09-19', value: 3 }),
        checkIn({ date: '2026-09-20', value: 1 }),
      ],
    });
    expect(result.fired).toBe(false);
  });

  it('fires on five of the last seven notes Frustrated/Flat with Sleep tagged on at least three', () => {
    const notes: MindsetNote[] = [
      note({ id: '1', mood: 'frustrated', tags: ['Sleep'], recordedAt: '2026-09-15T10:00:00Z' }),
      note({ id: '2', mood: 'flat', tags: ['Sleep'], recordedAt: '2026-09-16T10:00:00Z' }),
      note({ id: '3', mood: 'flat', tags: ['Sleep'], recordedAt: '2026-09-17T10:00:00Z' }),
      note({ id: '4', mood: 'frustrated', tags: [], recordedAt: '2026-09-18T10:00:00Z' }),
      note({ id: '5', mood: 'flat', tags: [], recordedAt: '2026-09-19T10:00:00Z' }),
      note({ id: '6', mood: 'confident', tags: [], recordedAt: '2026-09-20T10:00:00Z' }),
      note({ id: '7', mood: 'energised', tags: [], recordedAt: '2026-09-21T10:00:00Z' }),
    ];
    const result = evaluateDistress({ notes, checkins: [] });
    expect(result.fired).toBe(true);
    expect(result.signals).toContain('frustrated_flat_with_sleep');
  });

  it('does not fire on an ordinary rough week', () => {
    const notes: MindsetNote[] = [
      note({ id: '1', mood: 'confident', transcript: 'Solid session today.' }),
      note({ id: '2', mood: 'energised', transcript: 'Good win, tired but happy.' }),
    ];
    const result = evaluateDistress({
      notes,
      checkins: [checkIn({ date: '2026-09-20', value: 4 })],
    });
    expect(result.fired).toBe(false);
    expect(result.signals).toEqual([]);
  });
});
