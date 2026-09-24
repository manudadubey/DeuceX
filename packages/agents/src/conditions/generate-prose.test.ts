import { describe, expect, it } from 'vitest';
import { generateConditionsProse } from './generate-prose';
import { createMockProseClient, createInvalidProseClient } from './prose-mock-client';
import type { ProseBriefInput } from './prose-prompt';
import type { ConditionsBriefRules } from './types';

const RULES: ConditionsBriefRules = {
  tempRange: '17–22°C',
  tempMax: 22,
  rhRange: '55–65%',
  rhMax: 65,
  wind: '8–14 km/h',
  altitudeM: 80,
  ball: 'Dunlop Fort',
  ballDiff: false,
  io: 'Outdoor clay',
  airAmber: false,
  tension: false,
  tensionNote: 'Keep 24/23. Cooler air holds tension; no test needed.',
  testMains: null,
  testCrosses: null,
  frames: 3,
  framesSubLine: 'Normal grip',
  grip: 'Normal grip',
  refreshed: true,
  forecastSource: 'open-meteo',
};

function briefInput(tournamentId: string): ProseBriefInput {
  return { tournamentId, name: 'Poznań', city: 'Poznań', rules: RULES, previousEvent: null };
}

describe('generateConditionsProse', () => {
  it('produces a valid batch on the first call', async () => {
    const result = await generateConditionsProse(createMockProseClient(), [
      briefInput('poznan'),
      briefInput('sibiu'),
    ]);
    expect(result.output.briefs).toHaveLength(2);
    expect(result.output.briefs.map((b) => b.tournamentId).sort()).toEqual(['poznan', 'sibiu']);
  });

  it('throws after a second failed validation', async () => {
    await expect(
      generateConditionsProse(createInvalidProseClient(), [briefInput('poznan')]),
    ).rejects.toThrow(/failed schema validation twice/);
  });
});
