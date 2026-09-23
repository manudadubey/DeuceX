import type { ProseModelClient } from './prose-model-client';

interface PromptedBrief {
  tournamentId: string;
  tension: boolean;
  airAmber: boolean;
}

// Unlike match-scribe's mock (one fixed transcript per call), this batch's
// input shape (which tournamentIds, how many) varies every call, so the mock
// echoes back one generic-but-plausible sentence pair per requested id
// rather than a single static fixture — dev/test callers still get a valid,
// schema-passing response for whatever they actually asked about.
export function createMockProseClient(): ProseModelClient {
  return {
    async complete({ user }) {
      const parsed = JSON.parse(user) as { briefs: PromptedBrief[] };
      const briefs = parsed.briefs.map((b) => ({
        tournamentId: b.tournamentId,
        diff: b.airAmber
          ? 'Warmer and more humid than your last stamped event.'
          : 'Cooler and drier than your last stamped event.',
        practice: b.tension
          ? 'Hit at match hour if you can, not the cool of the morning.'
          : 'Normal practice hours suit this one.',
      }));
      return {
        raw: { briefs },
        usage: { inputTokens: 300 * briefs.length, outputTokens: 60 * briefs.length },
      };
    },
  };
}

// For testing/demonstrating the failed_validation path: every response is
// missing required fields.
export function createInvalidProseClient(): ProseModelClient {
  return {
    async complete() {
      return {
        raw: { briefs: [{ tournamentId: 'x' }] },
        usage: { inputTokens: 300, outputTokens: 20 },
      };
    },
  };
}
