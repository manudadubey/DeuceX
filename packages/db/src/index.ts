import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from './database.types';
export { createApproval, type ApprovalActionType } from './approvals';
export type { CreateApprovalInput, CreatedApproval } from './approvals';
export {
  listNotes,
  getNote,
  updateNoteContent,
  getSavedNotesThisMonth,
  saveCheckIn,
  listCheckIns,
  FREE_TIER_MONTHLY_NOTE_LIMIT,
  INITIAL_TAG_VOCABULARY,
  type Note,
  type CheckIn,
  type NoteCtx,
  type NoteMood,
  type NoteRound,
  type NoteStatus,
  type ListNotesFilter,
  type NoteContentPatch,
  type SaveCheckInInput,
} from './notes';
export {
  detectStage,
  ageFromDob,
  isMinor,
  GuardianEmailRequiredError,
  requireGuardianEmailIfMinor,
  canPublishProfile,
  countryDefaults,
  COUNTRY_DEFAULTS,
  DEFAULT_COUNTRY_DEFAULTS,
  ONBOARDING_AGENTS,
  DEFAULT_AGENT_TOGGLES,
  finishOnboarding,
  type Player,
  type PlayerTour,
  type PlayerVerification,
  type PlayerHanded,
  type PlayerSurface,
  type PlayerPlan,
  type PlayerBillingCycle,
  type PlayerDashboardState,
  type CountryDefaults,
  type OnboardingAgent,
  type AgentToggles,
  type FinishOnboardingInput,
} from './players';
export {
  listPatterns,
  setPatternDismissed,
  setPatternCoachShare,
  listRecentInsights,
  getInsightByDate,
  setInsightFocusDone,
  setInsightFeedback,
  getMindsetBoundaries,
  updateMindsetBoundaries,
  pauseOneWeekFrom,
  type Pattern,
  type Insight,
  type MindsetBoundaries,
  type PatternKind,
  type PatternConfidence,
  type InsightDelivery,
  type InsightFeedback,
  type MindsetBoundariesPatch,
} from './mindset';
export {
  insertLedgerLine,
  listLedgerLines,
  getFxRate,
  getFxRates,
  convertAtRate,
  convertLedgerLine,
  InvalidLedgerAmountError,
  MissingFxRateError,
  MissingRateForCurrencyError,
  type LedgerLine,
  type LedgerCategory,
  type LedgerSource,
  type InsertLedgerLineInput,
  type ListLedgerLinesFilter,
  type FxRate,
  type LedgerLineDisplay,
} from './ledger';
export {
  getLatestReserveBalance,
  listReserveEntries,
  enterReserveBalance,
  listPrizeReceivables,
  InvalidReserveAmountError,
  type ReserveEntry,
  type ReserveCause,
  type EnterReserveBalanceInput,
  type PrizeReceivable,
  type ReceivableEvent,
  type ReceivableStatus,
} from './reserves';

// Two clients, deliberately: the anon-scoped client respects row-level
// security and is what every player-facing request uses; the service-role
// client bypasses RLS and is only ever used by trusted server-side jobs
// (migrations, the queue worker, the admin console's own limited role).
// See TECH-ARCHITECTURE.md section 6.

export function createAnonClient(supabaseUrl: string, anonKey: string): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey);
}

export function createServiceRoleClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
