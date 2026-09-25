import { describe, expect, it } from 'vitest';
import { SIBIU_MENU_FIXTURE } from './menu-mock-client';
import type { MenuModelOutput } from './menu-schema';
import { ALLERGEN_CONFIRM_LINE, INGREDIENTS_UNREAD_LINE, rankMenu, type RankInput } from './rank';
import type { DietaryProfile } from './types';

// PRD-07's player: no pork, prefers fish and chicken, no allergies.
const ARYA: DietaryProfile = {
  exclusions: ['pork'],
  allergies: [],
  preferences: ['fish', 'chicken'],
};

// 1 RON in AUD on the scan date: 42 lei reads as A$14 (PRD-07 section 7).
const RON_TO_AUD = 0.332;

function input(overrides: Partial<RankInput> = {}): RankInput {
  return {
    extraction: SIBIU_MENU_FIXTURE,
    mode: 'pre-match',
    profile: ARYA,
    localHour: 21,
    city: 'Sibiu',
    history: [],
    rateMenuToHome: RON_TO_AUD,
    foodMoneyLeft: 34,
    ...overrides,
  };
}

describe('rankMenu: the Sibiu sample (FU-AC-4, FU-AC-5)', () => {
  it('produces exactly three picks in the prototype order with both prices', () => {
    const { picks, dishesRead, fewerThanTwo } = rankMenu(input());
    expect(dishesRead).toBe(14);
    expect(fewerThanTwo).toBe(false);
    expect(
      picks.map((p) => [p.rank, p.dishEnglish, p.priceMenu, Math.round(p.priceHome!)]),
    ).toEqual([
      [1, 'Grilled chicken breast with rice', 42, 14],
      [2, 'Pasta with tomato and basil sauce', 36, 12],
      [3, 'Beef sour soup', 28, 9],
    ]);
    for (const p of picks) {
      expect(p.why.length).toBeGreaterThan(0);
      expect(p.asks.length).toBeGreaterThan(0);
      expect(p.flags).toEqual([]);
    }
    expect(ALLERGEN_CONFIRM_LINE).toBe(
      'Allergen information is read from the menu and is advisory. Confirm ingredients with the kitchen before ordering.',
    );
  });

  it('puts the pork dish only in Not tonight, tagged Pork, naming the rule', () => {
    const { picks, avoid } = rankMenu(input());
    expect(picks.some((p) => p.dishOriginal === 'Sarmale cu mămăligă')).toBe(false);
    const sarmale = avoid.find((a) => a.dish === 'Sarmale cu mămăligă');
    expect(sarmale).toMatchObject({ tag: 'Pork', modeOnly: false });
    expect(sarmale!.reason).toContain('no pork');
  });

  it('lists the heavy and fried dishes as fine on a rest day', () => {
    const { avoid } = rankMenu(input());
    expect(avoid.map((a) => [a.dish, a.tag, a.modeOnly])).toEqual([
      ['Sarmale cu mămăligă', 'Pork', false],
      ['Mici cu muștar', 'Heavy', true],
      ['Papanași', 'Fried', true],
    ]);
  });
});

describe('rankMenu: hard filters (FU-7)', () => {
  it('never picks a dish containing an allergen, and says why', () => {
    const { picks, avoid } = rankMenu(input({ profile: { ...ARYA, allergies: ['gluten'] } }));
    expect(picks.some((p) => p.dishEnglish.startsWith('Pasta'))).toBe(false);
    const pasta = avoid.find((a) => a.dish.startsWith('Paste'));
    // Allergen rows lead the list, so the pasta is shown when it's among the first three.
    if (pasta) expect(pasta).toMatchObject({ tag: 'Allergen', modeOnly: false });
    for (const p of picks) {
      const dish = SIBIU_MENU_FIXTURE.dishes.find((d) => d.original === p.dishOriginal)!;
      expect(dish.contains).not.toContain('gluten');
    }
  });

  it('a meat exclusion rules out every meat kind', () => {
    const { picks } = rankMenu(input({ profile: { ...ARYA, exclusions: ['meat'] } }));
    for (const p of picks) {
      const dish = SIBIU_MENU_FIXTURE.dishes.find((d) => d.original === p.dishOriginal)!;
      expect(
        dish.contains.some((c) => ['pork', 'beef', 'lamb', 'poultry', 'other_meat'].includes(c)),
      ).toBe(false);
    }
  });

  it('Rest lifts the Heavy and Fried restrictions but never a rule', () => {
    const { avoid } = rankMenu(input({ mode: 'rest' }));
    expect(avoid.map((a) => a.tag)).toEqual(['Pork']);
  });
});

describe('rankMenu: unread ingredients (FU-AC-6)', () => {
  const menu = (dishes: MenuModelOutput['dishes']): MenuModelOutput => ({
    ...SIBIU_MENU_FIXTURE,
    dishes,
  });
  const chicken = SIBIU_MENU_FIXTURE.dishes.find((d) => d.english.startsWith('Grilled chicken'))!;
  const pasta = SIBIU_MENU_FIXTURE.dishes.find((d) => d.english.startsWith('Pasta'))!;
  const mystery = {
    ...chicken,
    original: 'Specialitatea casei',
    english: 'House speciality',
    ingredientsReadable: false,
    contains: [],
    traits: [
      'carbohydrate',
      'lean_protein',
      'light',
    ] as MenuModelOutput['dishes'][number]['traits'],
  };

  it('is not a pick when two others fit, even with a higher score', () => {
    const { picks } = rankMenu(input({ extraction: menu([mystery, chicken, pasta]) }));
    expect(picks.map((p) => p.dishEnglish)).toEqual([
      'Grilled chicken breast with rice',
      'Pasta with tomato and basil sauce',
    ]);
  });

  it('comes back as a last resort, leading with the confirm line', () => {
    const { picks, fewerThanTwo } = rankMenu(input({ extraction: menu([mystery, chicken]) }));
    expect(picks).toHaveLength(2);
    expect(fewerThanTwo).toBe(false);
    const unread = picks.find((p) => p.dishEnglish === 'House speciality')!;
    expect(unread.flags).toContain('ingredients-unread');
    expect(unread.why.startsWith(INGREDIENTS_UNREAD_LINE)).toBe(true);
  });

  it('says so when fewer than two fit', () => {
    const { picks, fewerThanTwo } = rankMenu(input({ extraction: menu([chicken]) }));
    expect(picks).toHaveLength(1);
    expect(fewerThanTwo).toBe(true);
  });
});

describe('rankMenu: money (FU-11)', () => {
  it('still shows a pick over the food money left, flagged with the overage', () => {
    const { picks } = rankMenu(input({ foodMoneyLeft: 10 }));
    const chicken = picks.find((p) => p.dishEnglish.startsWith('Grilled chicken'));
    // The penalty can push it down or out; the soup at A$9 is never flagged.
    const soup = picks.find((p) => p.dishEnglish === 'Beef sour soup')!;
    expect(soup.flags).not.toContain('over-budget');
    const flagged = picks.filter((p) => p.flags.includes('over-budget'));
    expect(flagged.length).toBeGreaterThan(0);
    for (const p of flagged) expect(p.overBy).toBeCloseTo(p.priceHome! - 10, 6);
    if (chicken) expect(chicken.flags).toContain('over-budget');
  });

  it('leaves home prices empty without a rate', () => {
    const { picks } = rankMenu(input({ rateMenuToHome: null }));
    expect(picks.every((p) => p.priceHome === null && p.flags.length === 0)).toBe(true);
  });
});

describe('rankMenu: second visit (section 7)', () => {
  it("ranks the city's last Worked dish first and says so", () => {
    const { picks, secondVisit } = rankMenu(
      input({
        history: [
          {
            city: 'Sibiu',
            dishEnglish: 'Beef sour soup',
            outcome: 'worked',
            loggedAt: '2025-09-12T19:00:00Z',
          },
          {
            city: 'Genoa',
            dishEnglish: 'Pasta with tomato and basil sauce',
            outcome: 'worked',
            loggedAt: '2026-09-07T19:00:00Z',
          },
        ],
      }),
    );
    expect(secondVisit).toBe('Last time here: Beef sour soup worked');
    expect(picks[0]!.dishEnglish).toBe('Beef sour soup');
  });

  it('ignores Flat meals and other cities', () => {
    const { secondVisit } = rankMenu(
      input({
        history: [
          {
            city: 'Sibiu',
            dishEnglish: 'Beef sour soup',
            outcome: 'flat',
            loggedAt: '2025-09-12T19:00:00Z',
          },
          {
            city: 'Cluj',
            dishEnglish: 'Club sandwich',
            outcome: 'worked',
            loggedAt: '2025-08-08T19:00:00Z',
          },
        ],
      }),
    );
    expect(secondVisit).toBeNull();
  });
});
