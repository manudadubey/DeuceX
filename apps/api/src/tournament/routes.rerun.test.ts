import { describe, expect, it } from 'vitest';
import { rerunAvailableAt } from './routes';

describe('rerunAvailableAt (T-AC-9)', () => {
  const now = new Date('2026-09-28T10:00:00Z');
  it('allows a re-run with no earlier manual run, or one over an hour ago', () => {
    expect(rerunAvailableAt(null, now)).toBeNull();
    expect(rerunAvailableAt('2026-09-28T08:59:00Z', now)).toBeNull();
  });
  it('says when the next one frees up inside the hour', () => {
    expect(rerunAvailableAt('2026-09-28T09:40:00Z', now)?.toISOString()).toBe(
      '2026-09-28T10:40:00.000Z',
    );
  });
});
