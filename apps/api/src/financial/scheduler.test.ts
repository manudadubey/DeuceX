import { describe, expect, it } from 'vitest';
import { isScheduledHour, utcDateString } from './scheduler';

// PRD-03 section 3: "Scheduled daily at 07:00 UTC" — a fixed hour, not a
// per-player local time.
describe('isScheduledHour', () => {
  it('is true only at 07:00 UTC', () => {
    expect(isScheduledHour(new Date('2026-09-22T07:00:00Z'))).toBe(true);
    expect(isScheduledHour(new Date('2026-09-22T07:59:00Z'))).toBe(true);
  });

  it('is false at any other UTC hour', () => {
    expect(isScheduledHour(new Date('2026-09-22T06:59:00Z'))).toBe(false);
    expect(isScheduledHour(new Date('2026-09-22T08:00:00Z'))).toBe(false);
  });
});

describe('utcDateString', () => {
  it('formats as YYYY-MM-DD in UTC', () => {
    expect(utcDateString(new Date('2026-09-22T07:00:00Z'))).toBe('2026-09-22');
  });
});
