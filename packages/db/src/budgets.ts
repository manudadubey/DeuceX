import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Hand-maintained unions for budget_estimates' and financial_action_snoozes'
// check constraints (step 2.2 migration), the same idiom ledger.ts and
// reserves.ts already use.
export type BudgetEstimateStatus = 'active' | 'superseded';
export type BudgetEstimate = Database['public']['Tables']['budget_estimates']['Row'];
export type FinancialActionSnooze = Database['public']['Tables']['financial_action_snoozes']['Row'];

export class InvalidBudgetEstimateAmountError extends Error {
  constructor() {
    super('A budget estimate must be greater than zero');
    this.name = 'InvalidBudgetEstimateAmountError';
  }
}

export interface CreateBudgetEstimateInput {
  playerId: string;
  label: string;
  estimateAmount: number;
  currency: string;
}

// A trip budget the player typed (PRD-03 F-16). Append-only, like
// ledger_lines and reserve_entries: a revision is a new row, never an
// update — see the migration's design note on why this table has no update
// policy.
export async function createBudgetEstimate(
  client: SupabaseClient<Database>,
  input: CreateBudgetEstimateInput,
): Promise<BudgetEstimate> {
  if (!(input.estimateAmount > 0)) throw new InvalidBudgetEstimateAmountError();

  const { data, error } = await client
    .from('budget_estimates')
    .insert({
      player_id: input.playerId,
      label: input.label,
      estimate_amount: input.estimateAmount,
      currency: input.currency,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// The current estimate per label: its latest row by estimated_at. A caller
// wanting the whole revision history (none exists yet in the UI) would
// query the table directly instead of calling this.
export async function listCurrentBudgetEstimates(
  client: SupabaseClient<Database>,
  playerId: string,
): Promise<BudgetEstimate[]> {
  const { data, error } = await client
    .from('budget_estimates')
    .select('*')
    .eq('player_id', playerId)
    .order('estimated_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const latestByLabel = new Map<string, BudgetEstimate>();
  for (const row of rows) {
    if (!latestByLabel.has(row.label)) latestByLabel.set(row.label, row);
  }
  return [...latestByLabel.values()];
}

export class InvalidWeeklyBudgetAmountError extends Error {
  constructor() {
    super('A weekly budget must be greater than zero');
    this.name = 'InvalidWeeklyBudgetAmountError';
  }
}

// PRD-03 F-17's weekly travel budget: `players.weekly_budget`, already added
// and collected by onboarding (step 1.4) — this just edits it from the
// Financial Agent page. Null clears it, matching "no budget set yet" (the
// weekly bar just does not render for that state).
export async function setWeeklyBudget(
  client: SupabaseClient<Database>,
  playerId: string,
  amount: number | null,
): Promise<void> {
  if (amount !== null && !(amount > 0)) throw new InvalidWeeklyBudgetAmountError();

  const { error } = await client
    .from('players')
    .update({ weekly_budget: amount })
    .eq('id', playerId);
  if (error) throw error;
}

export interface SnoozeFinancialActionInput {
  playerId: string;
  candidateKey: string;
  snoozedUntil: string;
}

// "Not this week" (F-18/F-AC-10): a plain append-only log, the same "latest
// row wins" idiom as reserve_entries' balance history — see
// isFinancialActionSnoozed below and the migration's design note.
export async function snoozeFinancialAction(
  client: SupabaseClient<Database>,
  input: SnoozeFinancialActionInput,
): Promise<FinancialActionSnooze> {
  const { data, error } = await client
    .from('financial_action_snoozes')
    .insert({
      player_id: input.playerId,
      candidate_key: input.candidateKey,
      snoozed_until: input.snoozedUntil,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listActiveFinancialActionSnoozes(
  client: SupabaseClient<Database>,
  playerId: string,
  now: Date = new Date(),
): Promise<FinancialActionSnooze[]> {
  const { data, error } = await client
    .from('financial_action_snoozes')
    .select('*')
    .eq('player_id', playerId)
    .gt('snoozed_until', now.toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const latestByKey = new Map<string, FinancialActionSnooze>();
  for (const row of rows) {
    if (!latestByKey.has(row.candidate_key)) latestByKey.set(row.candidate_key, row);
  }
  return [...latestByKey.values()];
}
