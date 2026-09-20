// The "(agent_name, player_id, scheduled_window) idempotency key"
// (TECH-ARCHITECTURE.md section 3), used as pg-boss's `singletonKey` so a
// retried or duplicated enqueue for the same agent/player/window is a no-op
// rather than a second run.
export interface AgentJobKeyInput {
  agentName: string;
  playerId: string;
  scheduledWindow: string;
}

export function buildAgentJobSingletonKey({
  agentName,
  playerId,
  scheduledWindow,
}: AgentJobKeyInput): string {
  return `${agentName}:${playerId}:${scheduledWindow}`;
}
