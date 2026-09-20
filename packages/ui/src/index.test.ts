import { describe, expect, it } from 'vitest';
import { PLACEHOLDER } from './index';

describe('ui package', () => {
  it('exists as a package boundary, pending the Baseline port', () => {
    expect(PLACEHOLDER).toBe('procircuit-ui');
  });
});
