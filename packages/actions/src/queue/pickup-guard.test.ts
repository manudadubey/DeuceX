import { describe, expect, it } from 'vitest';
import { evaluatePickup } from './pickup-guard';

describe('evaluatePickup', () => {
  it('proceeds when the agent is not paused and every required provider is on', () => {
    const decision = evaluatePickup({
      agentPaused: false,
      providerStates: { atp_feed: 'on', llm: 'on' },
      requiredProviders: ['atp_feed', 'llm'],
    });
    expect(decision).toEqual({ proceed: true });
  });

  it('proceeds when a required provider has no row yet (implicitly on)', () => {
    const decision = evaluatePickup({
      agentPaused: false,
      providerStates: {},
      requiredProviders: ['atp_feed'],
    });
    expect(decision).toEqual({ proceed: true });
  });

  it('is skipped_paused when the agent itself is paused', () => {
    const decision = evaluatePickup({
      agentPaused: true,
      providerStates: { llm: 'on' },
      requiredProviders: ['llm'],
    });
    expect(decision).toEqual({ proceed: false, reason: 'skipped_paused', cause: 'agent_paused' });
  });

  it('is skipped_paused when a required provider is off, even if the agent is not paused', () => {
    const decision = evaluatePickup({
      agentPaused: false,
      providerStates: { atp_feed: 'off', llm: 'on' },
      requiredProviders: ['atp_feed', 'llm'],
    });
    expect(decision).toEqual({
      proceed: false,
      reason: 'skipped_paused',
      cause: { provider: 'atp_feed' },
    });
  });

  it('ignores a provider being off if the agent does not depend on it', () => {
    const decision = evaluatePickup({
      agentPaused: false,
      providerStates: { stripe: 'off' },
      requiredProviders: ['llm'],
    });
    expect(decision).toEqual({ proceed: true });
  });

  it('checks agent-paused before any provider (order does not change the outcome, but the cause reported does)', () => {
    const decision = evaluatePickup({
      agentPaused: true,
      providerStates: { llm: 'off' },
      requiredProviders: ['llm'],
    });
    expect(decision).toEqual({ proceed: false, reason: 'skipped_paused', cause: 'agent_paused' });
  });
});
