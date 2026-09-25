// The agent names stored in agent_schedules.agent_name, agent_runs.agent_name
// and the pg-boss queue payload. Every writer and reader of a pause uses
// these, so a player's "off" in onboarding or Settings is the same row the
// runner checks before each run. Before this existed, onboarding and
// Settings wrote `mindset` while the runner read `mindset-coach`, so turning
// the Mindset Coach off did nothing.
export const AGENT_NAMES = {
  tournament: 'tournament',
  financial: 'financial',
  content: 'content',
  mindsetCoach: 'mindset-coach',
} as const;

export type AgentName = (typeof AGENT_NAMES)[keyof typeof AGENT_NAMES];
