import { describe, expect, it } from 'vitest';
import { axisK, buttonVariants, FLAG_CODES, placeFlag } from './index';

describe('ui package', () => {
  it('exports the Baseline component set (fixture smoke test)', () => {
    expect(buttonVariants({ variant: 'primary' })).toContain('bg-primary');
    expect(FLAG_CODES).toContain('POL');
  });

  it('axisK formats money-axis ticks the way Baseline does', () => {
    expect(axisK(0)).toBe('0');
    expect(axisK(12500)).toBe('12.5k');
    expect(axisK(-4200)).toBe('−4.2k');
    expect(axisK(900)).toBe('900');
  });

  it('placeFlag looks up a country code from a place name', () => {
    expect(placeFlag('Poznań')).toBe('POL');
    expect(placeFlag('nowhere')).toBeNull();
  });
});
