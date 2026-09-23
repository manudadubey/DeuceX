import { describe, expect, it } from 'vitest';
import { parseBlockedDateRanges } from './blocked-dates';

describe('parseBlockedDateRanges', () => {
  it('parses "D Mon – D Mon" into a single ISO date range, rolling into next year if the start has already passed', () => {
    const ranges = parseBlockedDateRanges('26 Oct – 1 Nov', new Date('2026-09-14T00:00:00Z'));
    expect(ranges).toEqual([{ start: '2026-10-26', end: '2026-11-01' }]);
  });

  it('discards a trailing note after the date range', () => {
    const ranges = parseBlockedDateRanges(
      '26 Oct – 1 Nov · coach block, Vienna',
      new Date('2026-09-14T00:00:00Z'),
    );
    expect(ranges).toEqual([{ start: '2026-10-26', end: '2026-11-01' }]);
  });

  it('accepts "to" as well as a dash', () => {
    const ranges = parseBlockedDateRanges('5 Oct to 11 Oct', new Date('2026-09-14T00:00:00Z'));
    expect(ranges).toEqual([{ start: '2026-10-05', end: '2026-10-11' }]);
  });

  it('rolls the end year forward across a year boundary', () => {
    const ranges = parseBlockedDateRanges('28 Dec – 3 Jan', new Date('2026-09-14T00:00:00Z'));
    expect(ranges).toEqual([{ start: '2026-12-28', end: '2027-01-03' }]);
  });

  it('returns no ranges rather than guessing wrong when the text does not parse', () => {
    expect(parseBlockedDateRanges(null)).toEqual([]);
    expect(parseBlockedDateRanges('')).toEqual([]);
    expect(parseBlockedDateRanges('Nothing blocked this stretch')).toEqual([]);
  });
});
