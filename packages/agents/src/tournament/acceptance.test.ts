import { describe, expect, it } from 'vitest';
import { computeAcceptanceStatus } from './acceptance';

describe('computeAcceptanceStatus (PRD-01 section 7)', () => {
  it("is direct inside last year's cut minus 10 places", () => {
    expect(computeAcceptanceStatus(502, 512, true)).toBe('direct');
    expect(computeAcceptanceStatus(503, 512, true)).toBe('alternate');
  });

  it('is alternate within 40 places outside the cut', () => {
    expect(computeAcceptanceStatus(552, 512, true)).toBe('alternate');
    expect(computeAcceptanceStatus(553, 512, true)).toBe('qualifying');
  });

  it('is qualifying beyond the alternate range when qualifying exists, else excluded', () => {
    expect(computeAcceptanceStatus(900, 512, true)).toBe('qualifying');
    expect(computeAcceptanceStatus(900, 512, false)).toBe('excluded');
  });

  it("falls back to qualifying-or-excluded when ranking or last year's cut is unknown", () => {
    expect(computeAcceptanceStatus(null, 512, true)).toBe('qualifying');
    expect(computeAcceptanceStatus(495, null, false)).toBe('excluded');
  });
});
