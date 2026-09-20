import { describe, expect, it } from 'vitest';
import { ApprovalNotFoundError, calculateCost, evaluatePickup, runGatedAction } from './index';

describe('actions package public surface', () => {
  it('exports the gate, recordRun, pricing and queue building blocks', () => {
    expect(typeof runGatedAction).toBe('function');
    expect(typeof calculateCost).toBe('function');
    expect(typeof evaluatePickup).toBe('function');
    expect(new ApprovalNotFoundError('x').name).toBe('ApprovalNotFoundError');
  });
});
