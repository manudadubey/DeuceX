import { describe, expect, it } from 'vitest';
import type { FinancialAction } from './load';
import { receivableProposalRunId } from './proposal-link';

const chase: FinancialAction = {
  candidateKey: 'chase_overdue_receivable',
  effectWeeks: 1.2,
  text: 'Chase the Genoa prize money.',
  secondSentence: null,
  receivableId: 'pz-1',
  runId: 'run-1',
};

describe('receivableProposalRunId', () => {
  it('links the run that proposed chasing this receivable', () => {
    expect(receivableProposalRunId(chase, 'pz-1')).toBe('run-1');
  });

  it('links nothing for a different receivable', () => {
    expect(receivableProposalRunId(chase, 'pz-2')).toBeNull();
  });

  it('links nothing when the one thing is something else, or there is none', () => {
    expect(
      receivableProposalRunId(
        { ...chase, candidateKey: 'update_balance', receivableId: null },
        'pz-1',
      ),
    ).toBeNull();
    expect(receivableProposalRunId(null, 'pz-1')).toBeNull();
  });

  it('links nothing for a run from before receivables were recorded', () => {
    const legacy: FinancialAction = { ...chase };
    delete legacy.receivableId;
    expect(receivableProposalRunId(legacy, 'pz-1')).toBeNull();
  });
});
