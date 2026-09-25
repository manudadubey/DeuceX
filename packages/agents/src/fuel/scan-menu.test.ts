import { describe, expect, it } from 'vitest';
import { AgentValidationError } from '@deucex/actions';
import {
  SIBIU_MENU_FIXTURE,
  createInvalidMenuExtractionClient,
  createMockMenuExtractionClient,
  createUnreadableMenuExtractionClient,
} from './menu-mock-client';
import type { MenuExtractionModelClient } from './menu-model-client';
import { menuModelOutputSchema } from './menu-schema';
import { buildMenuExtractionPrompt } from './menu-prompt';
import { UnreadableMenuError, extractMenu, stripNutritionClaims } from './scan-menu';

const INPUT = {
  imageDataUrls: ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'],
  mode: 'pre-match' as const,
  currencyHint: 'AUD',
  place: null,
};

describe('extractMenu', () => {
  it('validates the fixture against the schema', () => {
    expect(menuModelOutputSchema.safeParse(SIBIU_MENU_FIXTURE).success).toBe(true);
  });

  it('sends every page in one call and returns the reading', async () => {
    const seen: number[] = [];
    const base = createMockMenuExtractionClient();
    const client: MenuExtractionModelClient = {
      async complete(prompt) {
        seen.push(prompt.imageDataUrls.length);
        return base.complete(prompt);
      },
    };
    const { output } = await extractMenu(client, INPUT);
    expect(seen).toEqual([2]);
    expect(output.venueName).toBe('Hotel Continental Sibiu');
    expect(output.dishes).toHaveLength(14);
  });

  it('retries once with the validation error, then succeeds', async () => {
    let calls = 0;
    const good = createMockMenuExtractionClient();
    const client: MenuExtractionModelClient = {
      async complete(prompt) {
        calls += 1;
        if (calls === 1)
          return { raw: { readable: 'yes' }, usage: { inputTokens: 1, outputTokens: 1 } };
        expect(prompt.user).toContain('did not match the required schema');
        return good.complete(prompt);
      },
    };
    const { usage } = await extractMenu(client, INPUT);
    expect(calls).toBe(2);
    expect(usage.outputTokens).toBe(1501);
  });

  it('throws a validation error after two invalid answers', async () => {
    await expect(extractMenu(createInvalidMenuExtractionClient(), INPUT)).rejects.toBeInstanceOf(
      AgentValidationError,
    );
  });

  it('treats an unreadable photo as unreadable, with no partial picks (FU-AC-11)', async () => {
    await expect(extractMenu(createUnreadableMenuExtractionClient(), INPUT)).rejects.toBeInstanceOf(
      UnreadableMenuError,
    );
  });
});

describe('found live on the first real scan (step 4.3)', () => {
  it('reads the word "null" or an empty venue as no venue', () => {
    for (const venueName of ['null', 'NULL', '', '  ', 'n/a']) {
      const parsed = menuModelOutputSchema.parse({ ...SIBIU_MENU_FIXTURE, venueName });
      expect(parsed.venueName).toBeNull();
    }
    expect(
      menuModelOutputSchema.parse({ ...SIBIU_MENU_FIXTURE, menuCurrency: 'null' }).menuCurrency,
    ).toBeNull();
    expect(
      menuModelOutputSchema.parse({ ...SIBIU_MENU_FIXTURE, menuCurrency: 'aud' }).menuCurrency,
    ).toBe('AUD');
  });

  it('tells the model which currency a bare symbol means, and where the player is', () => {
    const home = buildMenuExtractionPrompt(INPUT).user;
    expect(home).toContain('Currency hint for an ambiguous symbol: AUD.');
    expect(home).not.toContain('The player is in');
    const away = buildMenuExtractionPrompt({
      ...INPUT,
      currencyHint: 'AUD',
      place: 'Sibiu, ROU',
    }).user;
    expect(away).toContain('The player is in Sibiu, ROU.');
  });
});

describe('stripNutritionClaims (FU-16)', () => {
  it('replaces a why with calories or supplements in it and drops such asks', () => {
    const dish = SIBIU_MENU_FIXTURE.dishes[6]!;
    const out = stripNutritionClaims(
      {
        ...SIBIU_MENU_FIXTURE,
        dishes: [
          {
            ...dish,
            why: 'About 600 calories with 40g of protein.',
            asks: ['Double rice, please.', 'Add a protein supplement.'],
          },
        ],
      },
      'pre-match',
    );
    expect(out.dishes[0]!.why).not.toMatch(/calorie|40g/);
    expect(out.dishes[0]!.asks).toEqual(['Double rice, please.']);
  });

  it('leaves the fixture untouched', () => {
    expect(stripNutritionClaims(SIBIU_MENU_FIXTURE, 'pre-match')).toEqual(SIBIU_MENU_FIXTURE);
  });
});
