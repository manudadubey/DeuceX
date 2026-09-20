import { describe, expect, it } from 'vitest';
import { hashApprovalPayload } from './approval-hash';

describe('hashApprovalPayload', () => {
  it('is stable across key order', () => {
    const a = hashApprovalPayload({ amount: 1360, currency: 'AUD', tournamentId: 't1' });
    const b = hashApprovalPayload({ tournamentId: 't1', amount: 1360, currency: 'AUD' });
    expect(a).toBe(b);
  });

  it('is stable across nested key order', () => {
    const a = hashApprovalPayload({ outer: { a: 1, b: 2 }, list: [{ x: 1, y: 2 }] });
    const b = hashApprovalPayload({ list: [{ y: 2, x: 1 }], outer: { b: 2, a: 1 } });
    expect(a).toBe(b);
  });

  it('changes when any value changes', () => {
    const a = hashApprovalPayload({ amount: 1360, currency: 'AUD' });
    const b = hashApprovalPayload({ amount: 1361, currency: 'AUD' });
    expect(a).not.toBe(b);
  });

  it('distinguishes payloads that would collide as strings without key-boundary quoting', () => {
    const a = hashApprovalPayload({ a: '1', b: '2' });
    const b = hashApprovalPayload({ a: '1,"b":2' });
    expect(a).not.toBe(b);
  });

  it('produces a 64-character hex sha256 digest', () => {
    expect(hashApprovalPayload({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
