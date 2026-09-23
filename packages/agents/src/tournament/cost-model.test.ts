import { describe, expect, it } from 'vitest';
import { computeAccommodationNights, estimateCost } from './cost-model';

describe('computeAccommodationNights', () => {
  it('defaults to 7 nights for a main-draw event and 9 when qualifying is likely (PRD-01 section 7)', () => {
    expect(computeAccommodationNights(false)).toBe(7);
    expect(computeAccommodationNights(true)).toBe(9);
  });
});

describe('estimateCost', () => {
  it('sums flights, accommodation, coach (only when the coach travels) and entry fee', () => {
    const withCoach = estimateCost({
      tier: 'CH 75',
      city: 'Poznań',
      qualifyingLikely: false,
      entryFee: 60,
      player: { homeAirport: 'VIE', coachWeeklyFee: 400, coachTravels: true },
    });
    expect(withCoach.coach).toBe(400);
    expect(withCoach.total).toBe(withCoach.flights + withCoach.accommodation + 400 + 60);
    expect(withCoach.route).toBe('VIE → Poznań');

    const withoutCoach = estimateCost({
      tier: 'CH 75',
      city: 'Poznań',
      qualifyingLikely: false,
      entryFee: 60,
      player: { homeAirport: 'VIE', coachWeeklyFee: 400, coachTravels: false },
    });
    expect(withoutCoach.coach).toBe(0);
  });

  it('omits the route line when the player has no home airport on file', () => {
    const cost = estimateCost({
      tier: 'ITF M25',
      city: 'Antalya',
      qualifyingLikely: false,
      entryFee: 0,
      player: { homeAirport: null, coachWeeklyFee: 0, coachTravels: false },
    });
    expect(cost.route).toBeNull();
  });
});
