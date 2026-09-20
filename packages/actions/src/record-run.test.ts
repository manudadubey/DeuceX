import { describe, expect, it, vi } from 'vitest';
import { AgentValidationError } from './errors';
import { type AgentRunInsert, type AgentRunsDb, recordRun } from './record-run';

function fakeDb() {
  const rows: AgentRunInsert[] = [];
  const db: AgentRunsDb = {
    async insertAgentRun(row) {
      rows.push(row);
    },
  };
  return { db, rows };
}

const META = {
  agentName: 'tournament-agent',
  playerId: 'player-1',
  triggerType: 'schedule' as const,
  inputsHash: 'hash-1',
  model: 'claude-sonnet-5',
  promptVersion: 'v1',
  schemaVersion: 'v1',
};

describe('recordRun', () => {
  it('writes a succeeded row with a cost derived from usage', async () => {
    const { db, rows } = fakeDb();

    const result = await recordRun(db, META, async () => ({
      output: { pick: 'W75 Poznan' },
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
    }));

    expect(result.output).toEqual({ pick: 'W75 Poznan' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'succeeded',
      output: { pick: 'W75 Poznan' },
      costAmount: 10.5,
      costCurrency: 'USD',
    });
  });

  it('writes a succeeded row with a null cost when the model has no pricing entry', async () => {
    const { db, rows } = fakeDb();

    await recordRun(db, { ...META, model: 'some-future-model' }, async () => ({
      output: {},
      usage: { inputTokens: 10, outputTokens: 10 },
    }));

    expect(rows[0]).toMatchObject({ status: 'succeeded', costAmount: null, costCurrency: null });
  });

  it('writes a failed_validation row and rethrows on AgentValidationError', async () => {
    const { db, rows } = fakeDb();
    const error = new AgentValidationError('output did not match schema');

    await expect(
      recordRun(db, META, async () => {
        throw error;
      }),
    ).rejects.toThrow(error);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'failed_validation', output: null });
  });

  it('writes a failed_infra row and rethrows on any other error', async () => {
    const { db, rows } = fakeDb();
    const error = new Error('network timeout');

    await expect(
      recordRun(db, META, async () => {
        throw error;
      }),
    ).rejects.toThrow(error);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'failed_infra', output: null });
  });

  it('never writes a row before the call completes (always exactly one row per call)', async () => {
    const { db, rows } = fakeDb();
    const calls = vi.fn(async () => ({ output: {} }));

    await recordRun(db, META, calls);
    await recordRun(db, META, calls);

    expect(calls).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
  });
});
