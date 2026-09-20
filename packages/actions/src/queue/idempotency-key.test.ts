import { describe, expect, it } from 'vitest';
import { buildAgentJobSingletonKey } from './idempotency-key';

describe('buildAgentJobSingletonKey', () => {
  it('combines agent, player and window into one key', () => {
    expect(
      buildAgentJobSingletonKey({
        agentName: 'tournament-agent',
        playerId: 'player-1',
        scheduledWindow: '2026-09-20T00:00:00Z',
      }),
    ).toBe('tournament-agent:player-1:2026-09-20T00:00:00Z');
  });

  it('produces different keys for different players in the same window', () => {
    const a = buildAgentJobSingletonKey({
      agentName: 'tournament-agent',
      playerId: 'player-1',
      scheduledWindow: 'w1',
    });
    const b = buildAgentJobSingletonKey({
      agentName: 'tournament-agent',
      playerId: 'player-2',
      scheduledWindow: 'w1',
    });
    expect(a).not.toBe(b);
  });

  it('produces the same key for the same agent/player/window (the duplicate-enqueue case)', () => {
    const input = { agentName: 'mindset-coach', playerId: 'player-1', scheduledWindow: 'w1' };
    expect(buildAgentJobSingletonKey(input)).toBe(buildAgentJobSingletonKey({ ...input }));
  });
});
