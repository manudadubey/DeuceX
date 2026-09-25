import type { Database, Json } from '@deucex/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type ApprovalGateDb, runGatedAction } from './gate';

// The other transition TECH-ARCHITECTURE.md section 3 names explicitly,
// alongside receivable_received: "write an entry_decisions row to
// entered." PRD-01 T-9: Accept entry is a two-step confirm that logs a
// planned expense and sets the tournament Entered; T-11: Withdraw removes
// that planned expense and sets Withdrawn, only while still before the
// deadline. Both run through this module, never trusting a client-supplied
// dollar amount — the planned amount always comes from the server's own
// current shortlist_candidates row, the same "don't trust the payload for
// the number, only for what was approved" shape receivables.ts already
// uses for gross/withholding amounts.

export class EntryNotAvailableError extends Error {
  constructor(readonly tournamentId: string) {
    super(`No shortlisted, undecided candidate ${tournamentId} for this player`);
    this.name = 'EntryNotAvailableError';
  }
}

export class EntryNotEnteredError extends Error {
  constructor(readonly tournamentId: string) {
    super(`Tournament ${tournamentId} is not currently Entered for this player`);
    this.name = 'EntryNotEnteredError';
  }
}

export class EntryDeadlinePassedError extends Error {
  constructor(readonly tournamentId: string) {
    super(
      `Tournament ${tournamentId}'s entry deadline has passed: withdrawal must be done on the player zone (PRD-01 T-11)`,
    );
    this.name = 'EntryDeadlinePassedError';
  }
}

export interface EntryContext {
  tournamentId: string;
  tournamentName: string;
  entryDeadline: string | null;
  costTotal: number;
  currency: string;
  decisionStatus: 'none' | 'entered' | 'skipped' | 'withdrawn';
  plannedExpenseId: string | null;
}

// What confirmEntry/withdrawEntry need from a database, kept narrow so both
// functions' money-and-status logic has a test that needs no live Postgres
// connection (mirroring gate.ts's ApprovalGateDb and receivables.ts's
// ReceivablesDb).
export interface EntriesDb {
  getEntryContext(tournamentId: string, playerId: string): Promise<EntryContext | null>;
  insertPlannedLedgerLine(input: {
    playerId: string;
    tournamentId: string;
    date: string;
    amount: number;
    currency: string;
    what: string;
  }): Promise<{ id: string }>;
  deletePlannedLedgerLine(id: string): Promise<void>;
  setEntryDecisionEntered(input: {
    tournamentId: string;
    playerId: string;
    plannedExpenseId: string;
    decidedAt: string;
    device: string | null;
  }): Promise<void>;
  setEntryDecisionWithdrawn(input: {
    tournamentId: string;
    playerId: string;
    decidedAt: string;
    device: string | null;
  }): Promise<void>;
}

export class SupabaseEntriesDb implements EntriesDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getEntryContext(tournamentId: string, playerId: string): Promise<EntryContext | null> {
    const [candidateRes, tournamentRes, decisionRes, playerRes] = await Promise.all([
      this.client
        .from('shortlist_candidates')
        .select('cost')
        .eq('tournament_id', tournamentId)
        .eq('player_id', playerId)
        .maybeSingle(),
      this.client
        .from('tournaments')
        .select('name, entry_deadline')
        .eq('id', tournamentId)
        .maybeSingle(),
      this.client
        .from('entry_decisions')
        .select('status, planned_expense_id')
        .eq('tournament_id', tournamentId)
        .eq('player_id', playerId)
        .maybeSingle(),
      this.client.from('players').select('home_currency').eq('id', playerId).maybeSingle(),
    ]);
    if (candidateRes.error) throw candidateRes.error;
    if (tournamentRes.error) throw tournamentRes.error;
    if (decisionRes.error) throw decisionRes.error;
    if (playerRes.error) throw playerRes.error;
    if (!candidateRes.data || !tournamentRes.data || !decisionRes.data || !playerRes.data)
      return null;

    // The shortlist run (apps/api/src/tournament/run.ts) already converts
    // every cost-model figure to the player's home currency before writing
    // shortlist_candidates (PRD-01 section 6: "money in home currency"), so
    // this is a read of that same currency, not a second conversion.
    const cost = candidateRes.data.cost as unknown as { total: number };
    return {
      tournamentId,
      tournamentName: tournamentRes.data.name,
      entryDeadline: tournamentRes.data.entry_deadline,
      costTotal: cost.total,
      currency: playerRes.data.home_currency,
      decisionStatus: decisionRes.data.status as EntryContext['decisionStatus'],
      plannedExpenseId: decisionRes.data.planned_expense_id,
    };
  }

  // CLAUDE.md's money rule ("original amount, currency and date only; never
  // store a converted amount") is not violated here: a planned/estimated
  // line has no real foreign-currency receipt behind it to preserve — the
  // cost model (packages/agents/src/tournament) only ever produces a home-
  // currency estimate, so amount_original/currency_original being the home
  // currency *is* this line's original, honest amount, the same way a
  // manual entry typed directly in the player's home currency would be.
  async insertPlannedLedgerLine(input: {
    playerId: string;
    tournamentId: string;
    date: string;
    amount: number;
    currency: string;
    what: string;
  }): Promise<{ id: string }> {
    const { data, error } = await this.client
      .from('ledger_lines')
      .insert({
        player_id: input.playerId,
        real_tournament_id: input.tournamentId,
        date: input.date,
        category: 'travel',
        what: input.what,
        amount_original: input.amount,
        currency_original: input.currency,
        fx_rate_date: input.date,
        source: 'planned',
      })
      .select('id')
      .single();
    if (error) throw error;
    return { id: data.id };
  }

  async deletePlannedLedgerLine(id: string): Promise<void> {
    const { error } = await this.client.from('ledger_lines').delete().eq('id', id);
    if (error) throw error;
  }

  async setEntryDecisionEntered(input: {
    tournamentId: string;
    playerId: string;
    plannedExpenseId: string;
    decidedAt: string;
    device: string | null;
  }): Promise<void> {
    const { error } = await this.client
      .from('entry_decisions')
      .update({
        status: 'entered',
        planned_expense_id: input.plannedExpenseId,
        decided_at: input.decidedAt,
        device: input.device,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', input.tournamentId)
      .eq('player_id', input.playerId)
      .eq('status', 'none');
    if (error) throw error;
  }

  async setEntryDecisionWithdrawn(input: {
    tournamentId: string;
    playerId: string;
    decidedAt: string;
    device: string | null;
  }): Promise<void> {
    const { error } = await this.client
      .from('entry_decisions')
      .update({
        status: 'withdrawn',
        planned_expense_id: null,
        decided_at: input.decidedAt,
        device: input.device,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', input.tournamentId)
      .eq('player_id', input.playerId)
      .eq('status', 'entered');
    if (error) throw error;
  }
}

export interface ConfirmEntryInput {
  approvalId: string;
  playerId: string;
  tournamentId: string;
  device?: string | null;
}

export interface ConfirmEntryResult {
  tournamentId: string;
  plannedExpenseId: string;
  plannedAmount: number;
  plannedCurrency: string;
}

// PRD-01 T-9: "confirmation logs a planned expense line attributed to the
// tournament and sets status Entered." The planned amount is the server's
// own current shortlist_candidates.cost.total, never a client-supplied
// number, so a stale or tampered UI cannot log an arbitrary amount.
export async function confirmEntry(
  gateDb: ApprovalGateDb,
  db: EntriesDb,
  input: ConfirmEntryInput,
  now: Date = new Date(),
): Promise<ConfirmEntryResult> {
  const payload: Json = { tournamentId: input.tournamentId };

  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'entry_confirm',
      payload,
    },
    async () => {
      const context = await db.getEntryContext(input.tournamentId, input.playerId);
      if (!context || context.decisionStatus !== 'none') {
        throw new EntryNotAvailableError(input.tournamentId);
      }

      const { id: plannedExpenseId } = await db.insertPlannedLedgerLine({
        playerId: input.playerId,
        tournamentId: input.tournamentId,
        date: now.toISOString().slice(0, 10),
        amount: context.costTotal,
        currency: context.currency,
        what: `Entry: ${context.tournamentName}`,
      });

      await db.setEntryDecisionEntered({
        tournamentId: input.tournamentId,
        playerId: input.playerId,
        plannedExpenseId,
        decidedAt: now.toISOString(),
        device: input.device ?? null,
      });

      return {
        tournamentId: input.tournamentId,
        plannedExpenseId,
        plannedAmount: context.costTotal,
        plannedCurrency: context.currency,
      };
    },
  );
}

export interface WithdrawEntryInput {
  approvalId: string;
  playerId: string;
  tournamentId: string;
  device?: string | null;
}

export interface WithdrawEntryResult {
  tournamentId: string;
}

// PRD-01 T-11: "Withdraw is available while Entered and before the
// deadline; it removes the planned expense and sets status Withdrawn."
// After the deadline the caller (apps/api's route) never even reaches this
// function's deadline check under normal use — apps/web's own UI already
// swaps the footer to the player-zone-link copy — but the check stays
// server-side too, since the approvals gate is exactly the place a stale
// client should not be trusted.
export async function withdrawEntry(
  gateDb: ApprovalGateDb,
  db: EntriesDb,
  input: WithdrawEntryInput,
  now: Date = new Date(),
): Promise<WithdrawEntryResult> {
  const payload: Json = { tournamentId: input.tournamentId };

  return runGatedAction(
    gateDb,
    { approvalId: input.approvalId, playerId: input.playerId, actionType: 'retract', payload },
    async () => {
      const context = await db.getEntryContext(input.tournamentId, input.playerId);
      if (!context || context.decisionStatus !== 'entered' || !context.plannedExpenseId) {
        throw new EntryNotEnteredError(input.tournamentId);
      }
      if (context.entryDeadline && context.entryDeadline < now.toISOString().slice(0, 10)) {
        throw new EntryDeadlinePassedError(input.tournamentId);
      }

      await db.deletePlannedLedgerLine(context.plannedExpenseId);
      await db.setEntryDecisionWithdrawn({
        tournamentId: input.tournamentId,
        playerId: input.playerId,
        decidedAt: now.toISOString(),
        device: input.device ?? null,
      });

      return { tournamentId: input.tournamentId };
    },
  );
}
