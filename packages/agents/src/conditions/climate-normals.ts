// CE-19 / PRD-08 section 3's failure behaviour: "the brief renders from the
// fact sheet and climate normals" when the forecast is unavailable (a date
// beyond the live forecast's horizon, or the provider being down). No real
// climate-normals archive is on TECH-ARCHITECTURE.md section 4's
// integrations list — this is a coarse, named placeholder (temperate-zone
// seasonal midpoints by hemisphere and month), the same "wire it with a
// defensible number, flag it for later" treatment PRD-08's own tension step
// and frames ladder already get. Good enough to produce a labelled,
// plausible brief; not a real forecast, and the Air tile's own
// refreshed=false is what tells the player so (CE-19), not this table.
interface SeasonalNormal {
  tempMinC: number;
  tempMaxC: number;
  rhMinPct: number;
  rhMaxPct: number;
}

// Indexed by meteorological season in the NORTHERN hemisphere; a southern-
// hemisphere venue reads the opposite pair six months apart.
const NORTHERN_SUMMER: SeasonalNormal = { tempMinC: 20, tempMaxC: 29, rhMinPct: 45, rhMaxPct: 65 };
const NORTHERN_WINTER: SeasonalNormal = { tempMinC: 4, tempMaxC: 12, rhMinPct: 55, rhMaxPct: 75 };
const SHOULDER: SeasonalNormal = { tempMinC: 12, tempMaxC: 20, rhMinPct: 50, rhMaxPct: 65 };

function northernSeasonFor(month: number): SeasonalNormal {
  if (month === 12 || month <= 2) return NORTHERN_WINTER;
  if (month >= 6 && month <= 8) return NORTHERN_SUMMER;
  return SHOULDER;
}

export function climateNormalFor(lat: number | null, monthIndex1To12: number): SeasonalNormal {
  const northern = northernSeasonFor(monthIndex1To12);
  if (lat === null || lat >= 0) return northern;
  // Southern hemisphere: same table, shifted six months.
  const shifted = ((monthIndex1To12 + 5) % 12) + 1;
  return northernSeasonFor(shifted);
}
