import { describe, expect, it } from 'vitest';
import { InvalidRankingCsvError, parseRankingCsv } from './csv';

const HEADER =
  'tour,tour_player_id,itf_id,name,country,week_start,tour_singles_rank,tour_singles_points,tour_doubles_rank,tour_doubles_points,itf_rank,itf_points';

describe('parseRankingCsv', () => {
  it('parses a well-formed row', () => {
    const csv = `${HEADER}\natp,B0AH,,Arya Dubey,Austria,2026-09-21,487,96,,,212,`;
    const rows = parseRankingCsv(csv);
    expect(rows).toEqual([
      {
        tour: 'atp',
        tourPlayerId: 'B0AH',
        itfId: null,
        name: 'Arya Dubey',
        country: 'Austria',
        weekStart: '2026-09-21',
        tourSinglesRank: 487,
        tourSinglesPoints: 96,
        tourDoublesRank: null,
        tourDoublesPoints: null,
        itfRank: 212,
        itfPoints: null,
      },
    ]);
  });

  it('handles a quoted name containing a comma', () => {
    const csv = `${HEADER}\nwta,,W212,"Dubey, Arya",Austria,2026-09-21,,,,,340,120`;
    const rows = parseRankingCsv(csv);
    expect(rows[0]?.name).toBe('Dubey, Arya');
  });

  it('rejects a file missing a required column', () => {
    const csv = 'tour,name,country\natp,Arya,Austria';
    expect(() => parseRankingCsv(csv)).toThrow(InvalidRankingCsvError);
  });

  it('rejects a row with neither tour_player_id nor itf_id', () => {
    const csv = `${HEADER}\natp,,,Arya Dubey,Austria,2026-09-21,487,96,,,,`;
    expect(() => parseRankingCsv(csv)).toThrow(/at least one of tour_player_id or itf_id/);
  });

  it('rejects a non-integer rank', () => {
    const csv = `${HEADER}\natp,B0AH,,Arya Dubey,Austria,2026-09-21,not-a-number,96,,,,`;
    expect(() => parseRankingCsv(csv)).toThrow(InvalidRankingCsvError);
  });

  it('rejects an invalid tour value', () => {
    const csv = `${HEADER}\nitf,B0AH,,Arya Dubey,Austria,2026-09-21,487,96,,,,`;
    expect(() => parseRankingCsv(csv)).toThrow(/tour must be/);
  });
});
