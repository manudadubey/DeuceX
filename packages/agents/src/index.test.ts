import { describe, expect, it } from 'vitest';
import { PLACEHOLDER } from './index';

describe('agents package', () => {
  it('exists as a package boundary, pending the first agent', () => {
    expect(PLACEHOLDER).toBe('procircuit-agents');
  });
});
