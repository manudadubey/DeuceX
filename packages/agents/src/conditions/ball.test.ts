import { describe, expect, it } from 'vitest';
import { computeBallDiff } from './ball';

describe('computeBallDiff', () => {
  it('is false when the ball is in the practice set', () => {
    expect(computeBallDiff('Dunlop Fort', ['Dunlop Fort', 'Head Tour'])).toBe(false);
  });
  it('is true when the ball differs', () => {
    expect(computeBallDiff('Wilson US Open', ['Dunlop Fort'])).toBe(true);
  });
  it('is false when the ball is not yet published', () => {
    expect(computeBallDiff(null, ['Dunlop Fort'])).toBe(false);
  });
});
