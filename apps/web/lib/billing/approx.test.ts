import { describe, expect, it } from 'vitest';
import { convertUsd, formatApprox } from './approx';

describe('approximate home-currency figure', () => {
  it('converts through the euro rates the FX archive stores', () => {
    // 25 September 2026's ECB rates: 1 EUR = 1.1403 USD = 1.622 AUD.
    expect(Math.round(convertUsd(35, 1.1403, 1.622))).toBe(50);
  });

  it('formats Australian dollars the way the rest of the app does', () => {
    expect(formatApprox(49.8, 'AUD')).toBe('A$50');
    expect(formatApprox(30.4, 'EUR')).toBe('€30');
  });
});
