import type { ConditionsBriefRules, PreviousStampedEventInput } from './types';

export interface ProseBriefInput {
  tournamentId: string;
  name: string;
  city: string | null;
  rules: ConditionsBriefRules;
  previousEvent: PreviousStampedEventInput | null;
}

export interface ProsePrompt {
  system: string;
  user: string;
}

const SYSTEM = `You write the two short sentences on a tennis player's Conditions brief: a comparison
sentence against their most recent event, then a practice sentence. Australian English. Never use
an em dash; use commas, colons, parentheses, en dashes or a new sentence. Never contradict the
numbers you are given (temperature, humidity, ball, altitude, tension) — describe what they mean
for play, don't restate them as numbers. No health or medical advice. Keep each sentence under 25
words. Answer for every tournamentId given, and only those.`;

// One user message per batch (up to MAX_BRIEFS_PER_PROSE_CALL entries),
// section 3's "five briefs per run are batched into one model call" — the
// deterministic tiles (brief.ts) are computed first and handed in as
// context the model must stay consistent with, not something it derives
// itself.
export function buildProsePrompt(briefs: readonly ProseBriefInput[]): ProsePrompt {
  const user = JSON.stringify({
    briefs: briefs.map((b) => ({
      tournamentId: b.tournamentId,
      name: b.name,
      city: b.city,
      tempRange: b.rules.tempRange,
      rhRange: b.rules.rhRange,
      wind: b.rules.wind,
      court: b.rules.io,
      altitudeM: b.rules.altitudeM,
      ball: b.rules.ball,
      ballDiff: b.rules.ballDiff,
      airAmber: b.rules.airAmber,
      tension: b.rules.tension,
      previousEvent: b.previousEvent,
    })),
  });
  return { system: SYSTEM, user };
}

export function buildCorrectiveProsePrompt(
  briefs: readonly ProseBriefInput[],
  validationError: string,
): ProsePrompt {
  const base = buildProsePrompt(briefs);
  return {
    system: base.system,
    user: `${base.user}\n\nYour previous answer failed validation: ${validationError}. Answer again, for every tournamentId listed, as valid JSON matching the required shape.`,
  };
}
