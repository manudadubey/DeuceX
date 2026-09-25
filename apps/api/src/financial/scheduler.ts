import { AGENT_NAMES } from '@deucex/shared';

// PRD-03 section 3 scheduled the Financial Agent at 07:00 UTC. Step 5.2
// (owner decision, 26 September 2026) moves it into the one morning batch at
// 07:00 in the player's own time zone (morning-run/scheduler.ts).
export const FINANCIAL_AGENT_NAME = AGENT_NAMES.financial;
