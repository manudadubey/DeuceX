import { describe, expect, it } from 'vitest';
import { computeFramesToBring, computeGrip } from './frames';

describe('computeGrip', () => {
  it('is Normal grip below both thresholds', () => {
    expect(computeGrip(20, 50)).toBe('Normal grip');
  });
  it('is Fresh overgrip every set at either threshold', () => {
    expect(computeGrip(28, 50)).toBe('Fresh overgrip every set');
    expect(computeGrip(20, 70)).toBe('Fresh overgrip every set');
  });
});

describe('computeFramesToBring', () => {
  it('defaults to 3 with no tension', () => {
    expect(computeFramesToBring(false, 20, 50, 4)).toEqual({ frames: 3, subLine: 'Normal grip' });
  });

  it('is 4 with tension below the heat-frames threshold', () => {
    const result = computeFramesToBring(true, 26, 55, 4);
    expect(result.frames).toBe(4);
  });

  it('is 5 with tension at or above 29C, when the profile carries enough', () => {
    const result = computeFramesToBring(true, 33, 70, 5);
    expect(result).toEqual({ frames: 5, subLine: 'Fresh overgrip every set' });
  });

  // Review register B10 / PRD-08 section 7: "never more than framesCarried,
  // and when the rule wants more the sub-line reads 'you carry 4; bring
  // them all'" — the prototype's own Antalya fixture combines this with the
  // grip line rather than replacing it.
  it('caps at framesCarried and names the cap, combined with the grip line', () => {
    const result = computeFramesToBring(true, 33, 70, 4);
    expect(result.frames).toBe(4);
    expect(result.subLine).toBe('Fresh overgrip every set · you carry 4; bring them all');
  });
});
