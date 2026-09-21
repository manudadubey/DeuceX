import type { Database, Json } from '@procircuit/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type ApprovalGateDb, runGatedAction } from './gate';

// The one transition TECH-ARCHITECTURE.md section 3 names explicitly,
// alongside the Stripe/Resend/ICS clients, as something only this module
// may do: "transition a prize_receivables row to received." M-DATA-2:
// receivables stay in their paying currency until this runs; only then
// does a realised amount enter reserves.

export class ReceivableNotFoundOrAlreadyReceivedError extends Error {
  constructor(readonly receivableId: string) {
    super(`No pending prize_receivables row ${receivableId} for this player`);
    this.name = 'ReceivableNotFoundOrAlreadyReceivedError';
  }
}

export class MissingReceivedDateRateError extends Error {
  constructor(
    readonly date: string,
    readonly currency: string,
  ) {
    super(`No fx_rates_daily row for ${currency} on ${date}: cannot realise this receivable yet`);
    this.name = 'MissingReceivedDateRateError';
  }
}

export interface PendingReceivable {
  id: string;
  playerId: string;
  grossAmount: number;
  playerShare: number;
  withholdingAmount: number;
  currency: string;
}

export interface ReceivedReceivableResult {
  receivableId: string;
  realisedAmountHome: number;
  realisedRate: number;
  realisedHomeCurrency: string;
  reserveEntryId: string;
  newReserveBalance: number;
}

// What markReceivableReceived needs from a database, kept narrow (mirroring
// gate.ts's ApprovalGateDb and record-run.ts's AgentRunsDb) so the money
// maths in this file has a test that needs no live Postgres connection.
export interface ReceivablesDb {
  getPendingReceivable(receivableId: string, playerId: string): Promise<PendingReceivable | null>;
  /** rate_to_eur for that currency on that date, or null if not yet archived. EUR is not looked up (always 1). */
  getFxRateToEur(date: string, currency: string): Promise<number | null>;
  getLatestReserveBalance(playerId: string): Promise<number | null>;
  applyReceivedTransition(input: {
    receivableId: string;
    playerId: string;
    receivedAt: string;
    realisedRate: number;
    realisedHomeCurrency: string;
    reserveEntry: { amount: number; previousAmount: number | null; currency: string };
  }): Promise<{ reserveEntryId: string }>;
}

export class SupabaseReceivablesDb implements ReceivablesDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getPendingReceivable(
    receivableId: string,
    playerId: string,
  ): Promise<PendingReceivable | null> {
    const { data, error } = await this.client
      .from('prize_receivables')
      .select('id, player_id, gross_amount, player_share, withholding_amount, currency, status')
      .eq('id', receivableId)
      .eq('player_id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== 'pending') return null;

    return {
      id: data.id,
      playerId: data.player_id,
      grossAmount: data.gross_amount,
      playerShare: data.player_share,
      withholdingAmount: data.withholding_amount,
      currency: data.currency,
    };
  }

  async getFxRateToEur(date: string, currency: string): Promise<number | null> {
    const { data, error } = await this.client
      .from('fx_rates_daily')
      .select('rate_to_eur, source')
      .eq('date', date)
      .eq('currency', currency);
    if (error) throw error;
    const rows = data ?? [];
    const chosen =
      rows.find((r) => r.source === 'ecb') ?? rows.find((r) => r.source === 'provisional');
    return chosen?.rate_to_eur ?? null;
  }

  async getLatestReserveBalance(playerId: string): Promise<number | null> {
    const { data, error } = await this.client
      .from('reserve_entries')
      .select('amount')
      .eq('player_id', playerId)
      .order('entered_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.amount ?? null;
  }

  // Two writes, not one Postgres function: no other action in this module
  // wraps its side effect in a stored procedure either (record-run.ts,
  // gate.ts's own claimApproval aside, which needs the atomic unique-
  // violation check a plain insert gives it for free). The window between
  // these two calls is real but narrow — this receivable is already claimed
  // pending=false by the update below before the reserve_entries insert
  // runs, so a retry of the whole gated action cannot double-apply it
  // (ReceivableNotFoundOrAlreadyReceivedError on the second attempt).
  async applyReceivedTransition(input: {
    receivableId: string;
    playerId: string;
    receivedAt: string;
    realisedRate: number;
    realisedHomeCurrency: string;
    reserveEntry: { amount: number; previousAmount: number | null; currency: string };
  }): Promise<{ reserveEntryId: string }> {
    const { error: updateError } = await this.client
      .from('prize_receivables')
      .update({
        status: 'received',
        received_at: input.receivedAt,
        realised_rate: input.realisedRate,
        realised_home_currency: input.realisedHomeCurrency,
      })
      .eq('id', input.receivableId)
      .eq('player_id', input.playerId)
      .eq('status', 'pending');
    if (updateError) throw updateError;

    const { data, error: insertError } = await this.client
      .from('reserve_entries')
      .insert({
        player_id: input.playerId,
        amount: input.reserveEntry.amount,
        currency: input.reserveEntry.currency,
        previous_amount: input.reserveEntry.previousAmount,
        cause: 'received_prize',
        device: null,
      })
      .select('id')
      .single();
    if (insertError) throw insertError;

    return { reserveEntryId: data.id };
  }
}

export interface MarkReceivableReceivedInput {
  approvalId: string;
  playerId: string;
  receivableId: string;
  /** The date the money actually landed, ISO yyyy-mm-dd; the ECB rate on this date is what realises the amount. */
  receivedDate: string;
  realisedHomeCurrency: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// PRD-03 F-9 / M-DATA-2: "only then does it count toward reserves." The
// player's net share (gross x player_share, less withholding) converts at
// the received date's archived rate, same formula as ledger.ts's
// convertAtRate (original-to-EUR divided by target-to-EUR), then adds onto
// the latest reserve balance the same way a player-typed update would,
// just with cause='received_prize' so it's distinguishable in the audit
// trail (reserve_entries' own comment).
export async function markReceivableReceived(
  gateDb: ApprovalGateDb,
  db: ReceivablesDb,
  input: MarkReceivableReceivedInput,
): Promise<ReceivedReceivableResult> {
  const payload: Json = {
    receivableId: input.receivableId,
    receivedDate: input.receivedDate,
    realisedHomeCurrency: input.realisedHomeCurrency,
  };

  return runGatedAction(
    gateDb,
    {
      approvalId: input.approvalId,
      playerId: input.playerId,
      actionType: 'receivable_received',
      payload,
    },
    async () => {
      const receivable = await db.getPendingReceivable(input.receivableId, input.playerId);
      if (!receivable) throw new ReceivableNotFoundOrAlreadyReceivedError(input.receivableId);

      const originalRate =
        receivable.currency === 'EUR'
          ? 1
          : await db.getFxRateToEur(input.receivedDate, receivable.currency);
      if (originalRate == null)
        throw new MissingReceivedDateRateError(input.receivedDate, receivable.currency);

      const targetRate =
        input.realisedHomeCurrency === 'EUR'
          ? 1
          : await db.getFxRateToEur(input.receivedDate, input.realisedHomeCurrency);
      if (targetRate == null) {
        throw new MissingReceivedDateRateError(input.receivedDate, input.realisedHomeCurrency);
      }

      const netOriginal =
        receivable.grossAmount * receivable.playerShare - receivable.withholdingAmount;
      const realisedAmountHome = round2((netOriginal / originalRate) * targetRate);
      const realisedRate = targetRate / originalRate;

      const previousAmount = await db.getLatestReserveBalance(input.playerId);
      const newAmount = round2((previousAmount ?? 0) + realisedAmountHome);

      const { reserveEntryId } = await db.applyReceivedTransition({
        receivableId: input.receivableId,
        playerId: input.playerId,
        receivedAt: input.receivedDate,
        realisedRate,
        realisedHomeCurrency: input.realisedHomeCurrency,
        reserveEntry: {
          amount: newAmount,
          previousAmount,
          currency: input.realisedHomeCurrency,
        },
      });

      return {
        receivableId: input.receivableId,
        realisedAmountHome,
        realisedRate,
        realisedHomeCurrency: input.realisedHomeCurrency,
        reserveEntryId,
        newReserveBalance: newAmount,
      };
    },
  );
}
