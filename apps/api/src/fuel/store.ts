import type { SupabaseClient } from '@supabase/supabase-js';
import {
  convertAtRate,
  getFxRates,
  latestRateBetween,
  type Database,
  type Json,
  type RateBetween,
} from '@deucex/db';
import type {
  DietaryProfile,
  FuelAllergen,
  FuelExclusion,
  FuelAvoid,
  FuelMode,
  FuelPick,
  MealHistoryEntry,
  NoteMood,
} from '@deucex/agents';

// Everything apps/api's Fuel code reads and writes, behind one interface
// (the content/store.ts and fans/store.ts split), so the service is tested
// against an in-memory store and the Supabase queries live in one place.

export interface FuelPlayer {
  id: string;
  timezone: string;
  homeCurrency: string;
  dailyFoodAllowance: number | null;
  nextMatchAt: string | null;
  nextMatchLabel: string | null;
}

export interface FuelTournament {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
}

export interface MenuScanInsert {
  playerId: string;
  capturedAt: string;
  localDate: string;
  city: string | null;
  country: string | null;
  tournamentId: string | null;
  venueName: string | null;
  venueType: 'restaurant' | 'room-service' | 'shop' | 'other' | null;
  pages: number;
  photoHashes: string[];
  languages: string[];
  dishesRead: number | null;
  menuCurrency: string | null;
  homeCurrency: string;
  rate: number | null;
  rateDate: string | null;
  mode: FuelMode;
  contextSnapshot: Record<string, unknown>;
  picks: FuelPick[];
  avoid: FuelAvoid[];
  secondVisit: string | null;
  status: 'ready' | 'unreadable' | 'failed';
  photosDeletedAt: string;
}

export interface PendingOutcomeMeal {
  id: string;
  playerId: string;
  localDate: string;
  timezone: string;
}

export interface FuelStore {
  getPlayer(playerId: string): Promise<FuelPlayer | null>;
  getProfile(playerId: string): Promise<DietaryProfile | null>;
  /** The Entered tournament whose dates cover `localDate`, if any. */
  currentTournament(playerId: string, localDate: string): Promise<FuelTournament | null>;
  /** recorded_at of the newest saved match note (the "last match" proxy). */
  lastMatchNoteAt(playerId: string): Promise<string | null>;
  history(playerId: string): Promise<MealHistoryEntry[]>;
  /** Today's Food ledger lines in home currency, each at its own locked rate. */
  todaysFoodSpendHome(playerId: string, localDate: string, homeCurrency: string): Promise<number[]>;
  rateBetween(from: string, to: string, onOrBefore: string): Promise<RateBetween | null>;
  insertScan(scan: MenuScanInsert): Promise<string>;
  mealsPendingOutcome(): Promise<PendingOutcomeMeal[]>;
  moodSignals(
    playerId: string,
    localDate: string,
    timezone: string,
  ): Promise<{ noteMoods: NoteMood[]; checkInValue: number | null }>;
  setInferredOutcome(mealId: string, outcome: 'worked' | 'flat', at: string): Promise<void>;
}

// Local-day bounds as UTC instants, for filtering notes.recorded_at by the
// player's own calendar day.
function localDayBoundsUtc(localDate: string, timezone: string): { start: string; end: string } {
  const probe = new Date(`${localDate}T12:00:00Z`);
  const local = new Date(probe.toLocaleString('en-US', { timeZone: timezone }));
  const offsetMs = local.getTime() - probe.getTime();
  const start = new Date(new Date(`${localDate}T00:00:00Z`).getTime() - offsetMs);
  const end = new Date(start.getTime() + 24 * 3_600_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export class SupabaseFuelStore implements FuelStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getPlayer(playerId: string): Promise<FuelPlayer | null> {
    const { data, error } = await this.db
      .from('players')
      .select('id, timezone, home_currency, daily_food_allowance, next_match_at, next_match_label')
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      timezone: data.timezone,
      homeCurrency: data.home_currency,
      dailyFoodAllowance: data.daily_food_allowance,
      nextMatchAt: data.next_match_at,
      nextMatchLabel: data.next_match_label,
    };
  }

  async getProfile(playerId: string): Promise<DietaryProfile | null> {
    const { data, error } = await this.db
      .from('fuel_profiles')
      .select('exclusions, allergies, preferences')
      .eq('player_id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      exclusions: data.exclusions as FuelExclusion[],
      allergies: data.allergies as FuelAllergen[],
      preferences: data.preferences,
    };
  }

  async currentTournament(playerId: string, localDate: string): Promise<FuelTournament | null> {
    const { data: decisions, error } = await this.db
      .from('entry_decisions')
      .select('tournament_id')
      .eq('player_id', playerId)
      .eq('status', 'entered');
    if (error) throw error;
    const ids = (decisions ?? []).map((d) => d.tournament_id);
    if (ids.length === 0) return null;
    const { data, error: tErr } = await this.db
      .from('tournaments')
      .select('id, name, city, country')
      .in('id', ids)
      .lte('start_date', localDate)
      .gte('end_date', localDate)
      .limit(1)
      .maybeSingle();
    if (tErr) throw tErr;
    return data;
  }

  async lastMatchNoteAt(playerId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('notes')
      .select('recorded_at')
      .eq('player_id', playerId)
      .eq('ctx', 'match')
      .eq('status', 'saved')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.recorded_at ?? null;
  }

  async history(playerId: string): Promise<MealHistoryEntry[]> {
    const { data, error } = await this.db
      .from('meal_logs')
      .select('city, dish_english, outcome, logged_at')
      .eq('player_id', playerId)
      .order('logged_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((m) => ({
      city: m.city,
      dishEnglish: m.dish_english,
      outcome: m.outcome as MealHistoryEntry['outcome'],
      loggedAt: m.logged_at,
    }));
  }

  async todaysFoodSpendHome(
    playerId: string,
    localDate: string,
    homeCurrency: string,
  ): Promise<number[]> {
    const { data, error } = await this.db
      .from('ledger_lines')
      .select('amount_original, currency_original, fx_rate_date')
      .eq('player_id', playerId)
      .eq('category', 'food')
      .eq('date', localDate);
    if (error) throw error;
    const out: number[] = [];
    for (const line of data ?? []) {
      const rates = await getFxRates(this.db, line.fx_rate_date, [
        line.currency_original,
        homeCurrency,
      ]);
      const ratesToEur = Object.fromEntries(
        Object.entries(rates).map(([c, r]) => [c, r.rateToEur]),
      );
      try {
        out.push(
          convertAtRate(line.amount_original, line.currency_original, homeCurrency, ratesToEur),
        );
      } catch {
        // No archived rate for that line's date: left out rather than
        // guessed, the Financial Agent's own rule (lib/financial/load.ts).
      }
    }
    return out;
  }

  rateBetween(from: string, to: string, onOrBefore: string) {
    return latestRateBetween(this.db, from, to, onOrBefore);
  }

  async insertScan(scan: MenuScanInsert): Promise<string> {
    const { data, error } = await this.db
      .from('menu_scans')
      .insert({
        player_id: scan.playerId,
        captured_at: scan.capturedAt,
        local_date: scan.localDate,
        city: scan.city,
        country: scan.country,
        tournament_id: scan.tournamentId,
        venue_name: scan.venueName,
        venue_type: scan.venueType,
        pages: scan.pages,
        photo_hashes: scan.photoHashes,
        languages: scan.languages,
        dishes_read: scan.dishesRead,
        menu_currency: scan.menuCurrency,
        home_currency: scan.homeCurrency,
        rate: scan.rate,
        rate_date: scan.rateDate,
        mode: scan.mode,
        context_snapshot: scan.contextSnapshot as Json,
        picks: scan.picks as unknown as Json,
        avoid: scan.avoid as unknown as Json,
        second_visit: scan.secondVisit,
        status: scan.status,
        photos_deleted_at: scan.photosDeletedAt,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  async mealsPendingOutcome(): Promise<PendingOutcomeMeal[]> {
    // Anything older than a week is past the point where a mood says
    // anything about the meal; the sweep only looks at recent rows.
    const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString().slice(0, 10);
    const { data, error } = await this.db
      .from('meal_logs')
      .select('id, player_id, local_date, players!inner(timezone)')
      .eq('outcome', 'none')
      .gte('local_date', since);
    if (error) throw error;
    return (data ?? []).map((m) => ({
      id: m.id,
      playerId: m.player_id,
      localDate: m.local_date,
      timezone: (m.players as unknown as { timezone: string }).timezone,
    }));
  }

  async moodSignals(playerId: string, localDate: string, timezone: string) {
    const { start, end } = localDayBoundsUtc(localDate, timezone);
    const [notes, checkIn] = await Promise.all([
      this.db
        .from('notes')
        .select('mood')
        .eq('player_id', playerId)
        .eq('status', 'saved')
        .not('mood', 'is', null)
        .gte('recorded_at', start)
        .lt('recorded_at', end)
        .order('recorded_at', { ascending: false }),
      this.db
        .from('check_ins')
        .select('value')
        .eq('player_id', playerId)
        .eq('date', localDate)
        .maybeSingle(),
    ]);
    if (notes.error) throw notes.error;
    if (checkIn.error) throw checkIn.error;
    return {
      noteMoods: (notes.data ?? []).map((n) => n.mood as NoteMood),
      checkInValue: checkIn.data?.value ?? null,
    };
  }

  async setInferredOutcome(mealId: string, outcome: 'worked' | 'flat', at: string) {
    // Only ever fills an untouched row: a player's tap always wins.
    const { error } = await this.db
      .from('meal_logs')
      .update({ outcome, outcome_source: 'inferred-mood', outcome_at: at })
      .eq('id', mealId)
      .eq('outcome', 'none');
    if (error) throw error;
  }
}
