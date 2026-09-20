import { describe, expect, it } from 'vitest';
import { MAX_RETRIES, nextRetryDelaySeconds } from './retry-schedule';

describe('nextRetryDelaySeconds', () => {
  it('is 5, then 20, then 60 minutes', () => {
    expect(nextRetryDelaySeconds(1)).toBe(5 * 60);
    expect(nextRetryDelaySeconds(2)).toBe(20 * 60);
    expect(nextRetryDelaySeconds(3)).toBe(60 * 60);
  });

  it('returns null past the third retry, so the caller gives up', () => {
    expect(nextRetryDelaySeconds(4)).toBeNull();
  });

  it('MAX_RETRIES matches the number of scheduled delays', () => {
    expect(MAX_RETRIES).toBe(3);
  });
});
