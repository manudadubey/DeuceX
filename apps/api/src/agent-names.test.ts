import { ONBOARDING_AGENT_NAMES } from '@deucex/db';
import { AGENT_NAMES } from '@deucex/shared';
import { describe, expect, it } from 'vitest';
import { AGENTS } from './admin/agents-registry';
import { MINDSET_AGENT_NAME } from './mindset-coach/scheduler';

// A pause is a row keyed by agent name, so the name a player's switch
// writes must be the name the runner and the console read. Onboarding and
// Settings once wrote `mindset` while the runner read `mindset-coach`, so a
// player turning the Mindset Coach off changed nothing. This fails if any
// player-facing pause name drifts from the agents apps/api actually runs.
describe('agent names', () => {
  const known = new Set(AGENTS.map((a) => a.name));

  it('every shared agent name is an agent apps/api knows', () => {
    for (const name of Object.values(AGENT_NAMES)) expect(known).toContain(name);
  });

  it('every onboarding switch pauses an agent apps/api knows', () => {
    for (const name of Object.values(ONBOARDING_AGENT_NAMES)) expect(known).toContain(name);
  });

  it('the Mindset Coach runner reads the name the switches write', () => {
    expect(MINDSET_AGENT_NAME).toBe(ONBOARDING_AGENT_NAMES.mindset);
    expect(MINDSET_AGENT_NAME).toBe(AGENT_NAMES.mindsetCoach);
  });
});
