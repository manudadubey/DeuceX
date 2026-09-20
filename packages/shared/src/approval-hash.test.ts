import { describe, expect, it } from 'vitest';
import { hashApprovalPayload } from './approval-hash';

describe('hashApprovalPayload', () => {
  it('is stable across key order', async () => {
    const a = await hashApprovalPayload({ amount: 1360, currency: 'AUD', tournamentId: 't1' });
    const b = await hashApprovalPayload({ tournamentId: 't1', amount: 1360, currency: 'AUD' });
    expect(a).toBe(b);
  });

  it('is stable across nested key order', async () => {
    const a = await hashApprovalPayload({ outer: { a: 1, b: 2 }, list: [{ x: 1, y: 2 }] });
    const b = await hashApprovalPayload({ list: [{ y: 2, x: 1 }], outer: { b: 2, a: 1 } });
    expect(a).toBe(b);
  });

  it('changes when any value changes', async () => {
    const a = await hashApprovalPayload({ amount: 1360, currency: 'AUD' });
    const b = await hashApprovalPayload({ amount: 1361, currency: 'AUD' });
    expect(a).not.toBe(b);
  });

  it('distinguishes payloads that would collide as strings without key-boundary quoting', async () => {
    const a = await hashApprovalPayload({ a: '1', b: '2' });
    const b = await hashApprovalPayload({ a: '1,"b":2' });
    expect(a).not.toBe(b);
  });

  it('produces a 64-character hex sha256 digest', async () => {
    expect(await hashApprovalPayload({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
