// Every agent that writes agent_runs rows, as the console names it (PRD-13
// section 4.4). `queued` marks the agents that run on AGENT_RUN_QUEUE, the
// only ones the pickup-time pause check reaches; the rest run on their own
// trigger (a saved note, a tap, a scan) and the console says so rather
// than showing a Pause control that would do nothing.

export interface AgentInfo {
  name: string;
  label: string;
  cadence: string;
  queued: boolean;
  /** Proposal-bearing: its runs can be acted on through an approval (approval rate applies). */
  proposes: boolean;
  /** Providers the agent depends on (provider_switches keys). */
  providers: readonly string[];
}

export const AGENTS: readonly AgentInfo[] = [
  {
    name: 'tournament',
    label: 'Tournament Agent',
    cadence: 'Sundays 20:00 UTC',
    queued: true,
    proposes: true,
    providers: [],
  },
  {
    name: 'financial',
    label: 'Financial Agent',
    cadence: 'Daily 07:00 UTC',
    queued: true,
    proposes: true,
    providers: ['openai'],
  },
  {
    name: 'mindset-coach',
    label: 'Mindset Coach',
    cadence: 'Daily, player time',
    queued: true,
    proposes: true,
    providers: ['openai'],
  },
  {
    name: 'match-scribe-extract',
    label: 'Match Scribe',
    cadence: 'Each saved note',
    queued: false,
    proposes: false,
    providers: ['openai', 'transcription'],
  },
  {
    name: 'content',
    label: 'Content Agent',
    cadence: 'After a saved note',
    queued: false,
    proposes: true,
    providers: ['openai'],
  },
  {
    name: 'conditions',
    label: 'Conditions',
    cadence: 'Daily refresh',
    queued: false,
    proposes: false,
    providers: ['openai'],
  },
  {
    name: 'fans/patron-note',
    label: 'Fans notes',
    cadence: 'On tap',
    queued: false,
    proposes: true,
    providers: ['openai'],
  },
  {
    name: 'financial-receipt-extract',
    label: 'Receipt scanning',
    cadence: 'On scan',
    queued: false,
    proposes: false,
    providers: ['openai'],
  },
  {
    name: 'fuel-menu-scan',
    label: 'Fuel',
    cadence: 'On scan',
    queued: false,
    proposes: false,
    providers: ['openai'],
  },
];

export function agentInfo(name: string): AgentInfo {
  return (
    AGENTS.find((a) => a.name === name) ?? {
      name,
      label: name,
      cadence: 'Unknown',
      queued: false,
      proposes: false,
      providers: [],
    }
  );
}

// PRD-13 section 4.4's kill switches. `wired` says whether turning it off
// actually stops something today: TimesFM doesn't exist yet (Release 2) and
// payouts run on Stripe's own weekly schedule, so holding them needs a
// Stripe write this step doesn't make.
export interface ProviderInfo {
  key: string;
  label: string;
  detail: string;
  wired: boolean;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    key: 'openai',
    label: 'Structured-output model',
    detail: 'Drafting and extraction for every agent that writes text',
    wired: true,
  },
  {
    key: 'transcription',
    label: 'Transcription',
    detail: 'Match Scribe voice notes; notes stay queued while off',
    wired: true,
  },
  {
    key: 'timesfm',
    label: 'Ranking forecast',
    detail: 'Elite baseline forecast, Release 2; not built yet',
    wired: false,
  },
  {
    key: 'patron_payouts',
    label: 'Patron payouts',
    detail: "Weekly Stripe payouts; holding them from here isn't built yet",
    wired: false,
  },
];
