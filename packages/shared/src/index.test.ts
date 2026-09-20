import { describe, expect, it } from 'vitest';
import type { Tour } from './index';

describe('shared types', () => {
  it('accepts the two supported tours', () => {
    const tours: Tour[] = ['atp', 'wta'];
    expect(tours).toHaveLength(2);
  });
});
