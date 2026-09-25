import type { RateBetween } from '@deucex/db';
import type { DietaryProfile, MealHistoryEntry, NoteMood } from '@deucex/agents';
import type {
  FuelPlayer,
  FuelStore,
  FuelTournament,
  MenuScanInsert,
  PendingOutcomeMeal,
} from './store';

// In-memory FuelStore for service tests (the content/memory-store.ts idiom).
export class MemoryFuelStore implements FuelStore {
  players = new Map<string, FuelPlayer>();
  profiles = new Map<string, DietaryProfile>();
  tournaments = new Map<string, FuelTournament>();
  lastMatch = new Map<string, string>();
  meals: MealHistoryEntry[] = [];
  foodSpend: number[] = [];
  rate: RateBetween | null = null;
  scans: Array<MenuScanInsert & { id: string }> = [];
  pending: PendingOutcomeMeal[] = [];
  moods = new Map<string, { noteMoods: NoteMood[]; checkInValue: number | null }>();
  inferred: Array<{ mealId: string; outcome: 'worked' | 'flat' }> = [];

  async getPlayer(id: string) {
    return this.players.get(id) ?? null;
  }
  async getProfile(id: string) {
    return this.profiles.get(id) ?? null;
  }
  async currentTournament(id: string) {
    return this.tournaments.get(id) ?? null;
  }
  async lastMatchNoteAt(id: string) {
    return this.lastMatch.get(id) ?? null;
  }
  async history() {
    return this.meals;
  }
  async todaysFoodSpendHome() {
    return this.foodSpend;
  }
  async rateBetween() {
    return this.rate;
  }
  async insertScan(scan: MenuScanInsert) {
    const id = `scan-${this.scans.length + 1}`;
    this.scans.push({ ...scan, id });
    return id;
  }
  async mealsPendingOutcome() {
    return this.pending;
  }
  async moodSignals(playerId: string, localDate: string) {
    return this.moods.get(`${playerId}:${localDate}`) ?? { noteMoods: [], checkInValue: null };
  }
  async setInferredOutcome(mealId: string, outcome: 'worked' | 'flat') {
    this.inferred.push({ mealId, outcome });
  }
}
