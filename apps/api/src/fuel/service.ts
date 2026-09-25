import { createHash } from 'node:crypto';
import type { Json } from '@deucex/db';
import { recordRun, type AgentRunsDb } from '@deucex/actions';
import {
  EMPTY_DIETARY_PROFILE,
  MENU_EXTRACTION_MODEL,
  MENU_EXTRACTION_PROMPT_VERSION,
  MENU_EXTRACTION_SCHEMA_VERSION,
  UnreadableMenuError,
  deriveMode,
  dietaryChip,
  extractMenu,
  foodMoneyLeft,
  inferOutcome,
  inferenceDue,
  dayAfter,
  rankMenu,
  type FuelAvoid,
  type FuelMode,
  type FuelPick,
  type MenuExtractionModelClient,
  type MenuModelOutput,
} from '@deucex/agents';
import type { FuelStore } from './store';

export interface FuelDeps {
  store: FuelStore;
  extractionClient: MenuExtractionModelClient;
  agentRuns: AgentRunsDb;
  now?: () => Date;
}

export interface MenuPhoto {
  buffer: Buffer;
  contentType: string;
}

export interface ScanResultDto {
  id: string;
  status: 'ready';
  venueName: string | null;
  venueType: string | null;
  languages: string[];
  dishesRead: number;
  menuCurrency: string | null;
  homeCurrency: string;
  rate: number | null;
  rateDate: string | null;
  mode: FuelMode;
  picks: FuelPick[];
  avoid: FuelAvoid[];
  fewerThanTwo: boolean;
  secondVisit: string | null;
  city: string | null;
  foodMoneyLeft: number | null;
}

export class PlayerNotFoundError extends Error {}

// The player's local calendar date, hour and HH:MM (en-CA formats a date as
// YYYY-MM-DD, the idiom the check-in card already uses).
export function localParts(now: Date, timezone: string) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return { date, time, hour: Number(time.slice(0, 2)) };
}

// PRD-07 section 3, end to end: assemble the input bundle, derive the mode,
// make one vision call over every page, convert prices, rank under the hard
// rules, store the result. The photos exist only as the buffers passed in:
// nothing here writes them anywhere, and photos_deleted_at records the
// moment extraction finished with them, on success and failure alike
// (FU-13). The caller drops its references as soon as this returns.
export async function scanMenu(
  deps: FuelDeps,
  playerId: string,
  photos: MenuPhoto[],
): Promise<ScanResultDto> {
  const now = (deps.now ?? (() => new Date()))();
  const player = await deps.store.getPlayer(playerId);
  if (!player) throw new PlayerNotFoundError();
  const local = localParts(now, player.timezone);

  const [profile, tournament, lastMatchAt, history, todaysFood] = await Promise.all([
    deps.store.getProfile(playerId),
    deps.store.currentTournament(playerId, local.date),
    deps.store.lastMatchNoteAt(playerId),
    deps.store.history(playerId),
    deps.store.todaysFoodSpendHome(playerId, local.date, player.homeCurrency),
  ]);
  const dietary = profile ?? EMPTY_DIETARY_PROFILE;

  // Travel legs aren't recorded anywhere yet, so Travel can't fire in
  // production (docs/BUILD-LOG.md step 4.3); the rule itself is tested.
  const mode = deriveMode({
    now,
    localHour: local.hour,
    nextMatchAt: player.nextMatchAt ? new Date(player.nextMatchAt) : null,
    lastMatchEndedAt: lastMatchAt ? new Date(lastMatchAt) : null,
    travelLegEndedAt: null,
    travelToday: false,
  });

  const photoHashes = photos.map((p) => createHash('sha256').update(p.buffer).digest('hex'));
  const base = {
    playerId,
    capturedAt: now.toISOString(),
    localDate: local.date,
    city: tournament?.city ?? null,
    country: tournament?.country ?? null,
    tournamentId: tournament?.id ?? null,
    pages: photos.length,
    photoHashes,
    homeCurrency: player.homeCurrency,
    mode,
  };

  let extraction: MenuModelOutput;
  try {
    const { output } = await recordRun(
      deps.agentRuns,
      {
        agentName: 'fuel-menu-scan',
        playerId,
        triggerType: 'manual',
        inputsHash: createHash('sha256')
          .update(JSON.stringify({ playerId, photoHashes, mode }))
          .digest('hex'),
        model: MENU_EXTRACTION_MODEL,
        promptVersion: MENU_EXTRACTION_PROMPT_VERSION,
        schemaVersion: MENU_EXTRACTION_SCHEMA_VERSION,
      },
      async () => {
        try {
          const result = await extractMenu(deps.extractionClient, {
            imageDataUrls: photos.map(
              (p) => `data:${p.contentType};base64,${p.buffer.toString('base64')}`,
            ),
            mode,
          });
          return { output: result.output as unknown as Json, usage: result.usage };
        } catch (err) {
          // An unreadable photo is a successful call with nothing to show:
          // audited (with its cost) as succeeded, then surfaced below.
          if (err instanceof UnreadableMenuError) {
            return {
              output: { unreadable: true },
              usage: err.usage ?? { inputTokens: 0, outputTokens: 0 },
            };
          }
          throw err;
        }
      },
    );
    if ((output as { unreadable?: boolean }).unreadable) throw new UnreadableMenuError();
    extraction = output as unknown as MenuModelOutput;
  } catch (err) {
    await deps.store.insertScan({
      ...base,
      venueName: null,
      venueType: null,
      languages: [],
      dishesRead: null,
      menuCurrency: null,
      rate: null,
      rateDate: null,
      contextSnapshot: {},
      picks: [],
      avoid: [],
      secondVisit: null,
      status: err instanceof UnreadableMenuError ? 'unreadable' : 'failed',
      photosDeletedAt: new Date().toISOString(),
    });
    throw err;
  }
  const photosDeletedAt = new Date().toISOString();

  const utcDate = now.toISOString().slice(0, 10);
  const rate = extraction.menuCurrency
    ? await deps.store.rateBetween(extraction.menuCurrency, player.homeCurrency, utcDate)
    : null;
  const moneyLeft = foodMoneyLeft(player.dailyFoodAllowance, todaysFood);

  const ranked = rankMenu({
    extraction,
    mode,
    profile: dietary,
    localHour: local.hour,
    city: tournament?.city ?? null,
    history,
    rateMenuToHome: rate?.rate ?? null,
    foodMoneyLeft: moneyLeft,
  });

  const contextSnapshot = {
    now: local.time,
    city: tournament?.city ?? null,
    tournament: tournament?.name ?? null,
    nextMatchAt: player.nextMatchAt,
    nextMatchLabel: player.nextMatchLabel,
    dietary: dietaryChip(dietary),
    foodMoneyLeft: moneyLeft,
    fewerThanTwo: ranked.fewerThanTwo,
  };

  const id = await deps.store.insertScan({
    ...base,
    venueName: extraction.venueName,
    venueType: extraction.venueType,
    languages: extraction.languages,
    dishesRead: ranked.dishesRead,
    menuCurrency: extraction.menuCurrency,
    rate: rate?.rate ?? null,
    rateDate: rate?.date ?? null,
    contextSnapshot,
    picks: ranked.picks,
    avoid: ranked.avoid,
    secondVisit: ranked.secondVisit,
    status: 'ready',
    photosDeletedAt,
  });

  return {
    id,
    status: 'ready',
    venueName: extraction.venueName,
    venueType: extraction.venueType,
    languages: extraction.languages,
    dishesRead: ranked.dishesRead,
    menuCurrency: extraction.menuCurrency,
    homeCurrency: player.homeCurrency,
    rate: rate?.rate ?? null,
    rateDate: rate?.date ?? null,
    mode,
    picks: ranked.picks,
    avoid: ranked.avoid,
    fewerThanTwo: ranked.fewerThanTwo,
    secondVisit: ranked.secondVisit,
    city: tournament?.city ?? null,
    foodMoneyLeft: moneyLeft,
  };
}

// FU-15 / FU-AC-9: the hourly sweep. For every recent meal with no outcome,
// once it is 18:00 local the day after, infer one from that day's mood if
// there is a signal; otherwise leave it as "No feedback".
export async function inferMealOutcomes(deps: Pick<FuelDeps, 'store' | 'now'>): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  let inferred = 0;
  for (const meal of await deps.store.mealsPendingOutcome()) {
    const local = localParts(now, meal.timezone);
    if (!inferenceDue(meal.localDate, local.date, local.hour)) continue;
    const signals = await deps.store.moodSignals(
      meal.playerId,
      dayAfter(meal.localDate),
      meal.timezone,
    );
    const outcome = inferOutcome(signals);
    if (!outcome) continue;
    await deps.store.setInferredOutcome(meal.id, outcome, now.toISOString());
    inferred += 1;
  }
  return inferred;
}
