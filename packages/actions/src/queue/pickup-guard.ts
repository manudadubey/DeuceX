// The "pause and provider-switch check at pickup" (TECH-ARCHITECTURE.md
// section 3): "the worker reads agent_schedules.paused for the player and
// agent, and provider_switches for every provider the agent depends on, and
// if any is off it marks the job skipped_paused and moves on." Both checks
// map to the same outcome (skipped_paused) per that same sentence, which is
// why this returns one reason code, not two.
export type ProviderState = 'on' | 'off';

export interface PickupGuardInput {
  agentPaused: boolean;
  /** Latest known state per provider name. A provider missing here is "on" (TECH-ARCHITECTURE.md 2.4: "a provider with no row yet is implicitly on"). */
  providerStates: Record<string, ProviderState>;
  /** The providers this specific agent depends on. */
  requiredProviders: readonly string[];
}

export type PickupDecision =
  | { proceed: true }
  | { proceed: false; reason: 'skipped_paused'; cause: 'agent_paused' | { provider: string } };

export function evaluatePickup(input: PickupGuardInput): PickupDecision {
  if (input.agentPaused) {
    return { proceed: false, reason: 'skipped_paused', cause: 'agent_paused' };
  }

  for (const provider of input.requiredProviders) {
    const state = input.providerStates[provider] ?? 'on';
    if (state === 'off') {
      return { proceed: false, reason: 'skipped_paused', cause: { provider } };
    }
  }

  return { proceed: true };
}
