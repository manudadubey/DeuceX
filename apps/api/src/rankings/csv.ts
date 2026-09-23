// The CSV import implementation build plan step 3.1 asks for first, "the
// licensed feeds are added when signed" (TECH-ARCHITECTURE.md section 4's
// own honest risk statement about ATP/ITF licensing being slow and opaque).
// One row per person per week, regardless of which of the four feeds
// (atp_rankings, wta_rankings, itf_men_rankings, itf_women_rankings) it
// came from — a person's tour singles/doubles figures and their ITF figures
// share one row (ranking_snapshots' own shape), so one CSV can carry both.
export interface RankingFeedRow {
  tour: 'atp' | 'wta';
  tourPlayerId: string | null;
  itfId: string | null;
  name: string;
  country: string;
  weekStart: string;
  tourSinglesRank: number | null;
  tourSinglesPoints: number | null;
  tourDoublesRank: number | null;
  tourDoublesPoints: number | null;
  itfRank: number | null;
  itfPoints: number | null;
}

const REQUIRED_HEADER = [
  'tour',
  'tour_player_id',
  'itf_id',
  'name',
  'country',
  'week_start',
  'tour_singles_rank',
  'tour_singles_points',
  'tour_doubles_rank',
  'tour_doubles_points',
  'itf_rank',
  'itf_points',
] as const;

export class InvalidRankingCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRankingCsvError';
  }
}

// A small RFC4180 line splitter (quoted fields, escaped "" inside quotes) —
// no external dependency, the same "hand-roll it, it's small" choice
// packages/agents/src/financial/export-csv.ts already made for the writing
// direction.
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

function parseIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) throw new InvalidRankingCsvError(`Not an integer: "${value}"`);
  return n;
}

export function parseRankingCsv(text: string): RankingFeedRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) throw new InvalidRankingCsvError('Empty file');

  const header = parseCsvLine(lines[0]!).map((h) => h.trim());
  const missing = REQUIRED_HEADER.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new InvalidRankingCsvError(`Missing column(s): ${missing.join(', ')}`);
  }
  const col = (name: string) => header.indexOf(name);

  return lines.slice(1).map((line, idx) => {
    const rowNum = idx + 2; // 1-indexed, plus the header row
    const cells = parseCsvLine(line);
    const tour = cells[col('tour')]?.trim();
    if (tour !== 'atp' && tour !== 'wta') {
      throw new InvalidRankingCsvError(`Row ${rowNum}: tour must be "atp" or "wta", got "${tour}"`);
    }
    const name = cells[col('name')]?.trim();
    const country = cells[col('country')]?.trim();
    const weekStart = cells[col('week_start')]?.trim();
    if (!name || !country || !weekStart) {
      throw new InvalidRankingCsvError(`Row ${rowNum}: name, country and week_start are required`);
    }
    const tourPlayerId = cells[col('tour_player_id')]?.trim() || null;
    const itfId = cells[col('itf_id')]?.trim() || null;
    if (!tourPlayerId && !itfId) {
      throw new InvalidRankingCsvError(
        `Row ${rowNum}: at least one of tour_player_id or itf_id is required`,
      );
    }
    return {
      tour,
      tourPlayerId,
      itfId,
      name,
      country,
      weekStart,
      tourSinglesRank: parseIntOrNull(cells[col('tour_singles_rank')] ?? ''),
      tourSinglesPoints: parseIntOrNull(cells[col('tour_singles_points')] ?? ''),
      tourDoublesRank: parseIntOrNull(cells[col('tour_doubles_rank')] ?? ''),
      tourDoublesPoints: parseIntOrNull(cells[col('tour_doubles_points')] ?? ''),
      itfRank: parseIntOrNull(cells[col('itf_rank')] ?? ''),
      itfPoints: parseIntOrNull(cells[col('itf_points')] ?? ''),
    };
  });
}
