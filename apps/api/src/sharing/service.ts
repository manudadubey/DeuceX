import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import { convertAtRate, getFxRates } from '@procircuit/db';
import {
  computeBurnState,
  computeGrossWeeklySpend,
  computeMonthlyPnl,
  computeRunwayWeeks,
  runwayColour,
  type FinancialLedgerLine,
  type MonthlyPnl,
  type RunwayColour,
} from '@procircuit/agents';

const LOOKBACK_DAYS = 60;

// PRD-12 4.9 / section 10 (M-SHARE-1, M-SHARE-2): a coach and a manager
// link see disjoint, fixed sets of fields — this is the one place that
// scoping is enforced, in application code rather than RLS, because RLS
// works per-row/per-table, not per-field-set, and a share-link visitor has
// no player session for RLS to key on at all (see the service-role bypass
// in SupabaseSharingDb below). Every field named "never" in PRD-12 section
// 10 is a field this file's two DTOs structurally cannot contain — there is
// no transcript, audio_ref, mood or money field anywhere in CoachViewData,
// and no notes or agent-draft field anywhere in ManagerViewData.

export interface CoachMatchNote {
  recordedAt: string;
  result: string | null;
  opponent: string | null;
  tags: unknown;
  summary: string | null;
}

export interface CoachPattern {
  statement: string;
  kind: string;
  confidence: string;
}

export interface CoachViewData {
  scope: 'coach';
  playerName: string;
  matches: CoachMatchNote[];
  patterns: CoachPattern[];
  /** Tournament Agent (step 3.2) and Conditions (step 3.3) aren't built yet — an honest empty section, not a fake one. */
  shortlistAvailable: false;
  conditionsAvailable: false;
}

export interface ManagerExpenseLine {
  date: string;
  category: string;
  what: string;
  amountHome: number;
}

export interface ManagerViewData {
  scope: 'manager';
  playerName: string;
  homeCurrency: string;
  reserves: number;
  grossWeeklySpend: number;
  netBurn: number;
  /** null means steady (net burn is zero or negative — computeRunwayWeeks' own Infinity, converted here since JSON.stringify silently turns Infinity into null anyway; better an explicit null than a wire value nothing decodes back to Infinity). */
  runwayWeeks: number | null;
  runwayColour: RunwayColour;
  monthlyPnl: MonthlyPnl;
  expenses: ManagerExpenseLine[];
  /** Patrons/payouts don't exist until step 4.1 — see PRD-12 4.9's own "No agent outputs" scope. */
  patronsAvailable: false;
}

export type ShareViewData = CoachViewData | ManagerViewData;

export interface ActiveShareLink {
  id: string;
  playerId: string;
  scope: 'coach' | 'manager';
}

// Narrow on purpose (mirrors every *Db interface in this codebase):
// resolveShareLink's own logic — revoked/expired refusal, open-count bump
// before the read, coach vs manager branch — is what this file's test
// proves without a live Postgres connection.
export interface SharingDb {
  findActiveLink(token: string, now: Date): Promise<ActiveShareLink | null>;
  recordOpen(linkId: string, now: Date): Promise<void>;
  getCoachData(playerId: string): Promise<CoachViewData>;
  getManagerData(playerId: string): Promise<ManagerViewData>;
}

// ST-15/M-SHARE-3: revoked or expired must fail "within a minute" — this
// checks both on every single request, with nothing cached, so the very
// next request after a revoke already refuses (see routes.ts, which is
// this function's only real caller and therefore the only place a
// revocation is actually felt).
export async function resolveShareLink(
  db: SharingDb,
  token: string,
  now: Date = new Date(),
): Promise<ShareViewData | null> {
  const link = await db.findActiveLink(token, now);
  if (!link) return null;

  await db.recordOpen(link.id, now);

  return link.scope === 'coach' ? db.getCoachData(link.playerId) : db.getManagerData(link.playerId);
}

export class SupabaseSharingDb implements SharingDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findActiveLink(token: string, now: Date): Promise<ActiveShareLink | null> {
    const { data, error } = await this.client
      .from('share_links')
      .select('id, player_id, scope, revoked, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.revoked || new Date(data.expires_at).getTime() <= now.getTime()) return null;

    return { id: data.id, playerId: data.player_id, scope: data.scope as 'coach' | 'manager' };
  }

  async recordOpen(linkId: string, now: Date): Promise<void> {
    const { data, error: readError } = await this.client
      .from('share_links')
      .select('open_count')
      .eq('id', linkId)
      .single();
    if (readError) throw readError;

    const { error } = await this.client
      .from('share_links')
      .update({ open_count: (data?.open_count ?? 0) + 1, last_opened_at: now.toISOString() })
      .eq('id', linkId);
    if (error) throw error;
  }

  private async getPlayerName(playerId: string): Promise<string> {
    const { data, error } = await this.client
      .from('players')
      .select('name')
      .eq('id', playerId)
      .single();
    if (error) throw error;
    return data.name;
  }

  // Coach scope (PRD-12 section 10, PRD-02 section 4.7, PRD-06 section 4.3):
  // match results and the extraction's own coach summary, never the
  // transcript or audio; non-dismissed Mindset patterns; never mood, never
  // money.
  async getCoachData(playerId: string): Promise<CoachViewData> {
    const [playerName, notes, patterns] = await Promise.all([
      this.getPlayerName(playerId),
      this.client
        .from('notes')
        .select('recorded_at, result, opponent, tags, summary')
        .eq('player_id', playerId)
        .eq('ctx', 'match')
        .eq('coach_share', true)
        .order('recorded_at', { ascending: false })
        .limit(20),
      this.client
        .from('patterns')
        .select('statement, kind, confidence')
        .eq('player_id', playerId)
        .eq('dismissed', false)
        .eq('coach_share', true),
    ]);
    if (notes.error) throw notes.error;
    if (patterns.error) throw patterns.error;

    return {
      scope: 'coach',
      playerName,
      matches: (notes.data ?? []).map((n) => ({
        recordedAt: n.recorded_at,
        result: n.result,
        opponent: n.opponent,
        tags: n.tags,
        summary: n.summary,
      })),
      patterns: (patterns.data ?? []).map((p) => ({
        statement: p.statement,
        kind: p.kind,
        confidence: p.confidence,
      })),
      shortlistAvailable: false,
      conditionsAvailable: false,
    };
  }

  // Manager scope (PRD-12 section 10, PRD-03 section 2): runway, reserves,
  // P&L, expenses — the same deterministic maths
  // apps/web/lib/financial/load.ts uses, reused here at the pure-function
  // level (packages/agents/src/financial) rather than importing load.ts
  // itself, since that file lives in apps/web (not an importable shared
  // package) and computes several fields PRD-12 explicitly excludes from
  // the manager scope (the weekly budget bar, milestone, "one thing"
  // action sentence — all "agent outputs," never shown to a manager link).
  async getManagerData(playerId: string): Promise<ManagerViewData> {
    const [playerRes, homeCurrencyRes] = await Promise.all([
      this.getPlayerName(playerId),
      this.client.from('players').select('home_currency').eq('id', playerId).single(),
    ]);
    if (homeCurrencyRes.error) throw homeCurrencyRes.error;
    const homeCurrency = homeCurrencyRes.data.home_currency;

    const now = new Date();
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;

    const [ledgerRes, reserveRes, realisedThisMonthRes] = await Promise.all([
      this.client.from('ledger_lines').select('*').eq('player_id', playerId).gte('date', since),
      this.client
        .from('reserve_entries')
        .select('amount')
        .eq('player_id', playerId)
        .order('entered_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.client
        .from('reserve_entries')
        .select('amount, previous_amount')
        .eq('player_id', playerId)
        .eq('cause', 'received_prize')
        .gte('entered_at', monthStart),
    ]);
    if (ledgerRes.error) throw ledgerRes.error;
    if (reserveRes.error) throw reserveRes.error;
    if (realisedThisMonthRes.error) throw realisedThisMonthRes.error;

    const ledgerRows = ledgerRes.data ?? [];
    const currencies = [...new Set(ledgerRows.map((l) => l.currency_original))];
    const ratesByDate = new Map<string, Record<string, number>>();
    for (const line of ledgerRows) {
      if (!ratesByDate.has(line.fx_rate_date)) {
        const rates = await getFxRates(this.client, line.fx_rate_date, currencies);
        ratesByDate.set(
          line.fx_rate_date,
          Object.fromEntries(Object.entries(rates).map(([c, r]) => [c, r.rateToEur])),
        );
      }
    }

    const ledgerLines: (FinancialLedgerLine & ManagerExpenseLine)[] = ledgerRows.map((l) => {
      const amountHome = convertAtRate(
        l.amount_original,
        l.currency_original,
        homeCurrency,
        ratesByDate.get(l.fx_rate_date) ?? {},
      );
      return {
        id: l.id,
        date: l.date,
        category: l.category,
        what: l.what,
        amountHome,
        label: null,
      };
    });

    const reserves = reserveRes.data?.amount ?? 0;
    const grossWeeklySpend = computeGrossWeeklySpend(ledgerLines, now);
    // patronMrr is always 0 until step 4.1 (patrons/payouts) exists — same
    // stub apps/api/src/financial/service.ts uses today.
    const burn = computeBurnState(grossWeeklySpend, 0);
    const runwayWeeks = computeRunwayWeeks(reserves, burn.netBurn);

    const realisedIncome = (realisedThisMonthRes.data ?? []).map(
      (r) => r.amount - (r.previous_amount ?? 0),
    );
    const expensesInMonth = ledgerLines.filter((l) => l.date >= monthStart);
    const monthlyPnl = computeMonthlyPnl({
      expensesInMonth,
      receivedPrizeIncomeHome: realisedIncome,
      receivedPatronPayoutsHome: [],
    });

    return {
      scope: 'manager',
      playerName: playerRes,
      homeCurrency,
      reserves,
      grossWeeklySpend,
      netBurn: burn.netBurn,
      runwayWeeks: runwayWeeks === Infinity ? null : runwayWeeks,
      runwayColour: runwayColour(runwayWeeks === Infinity ? 999 : runwayWeeks),
      monthlyPnl,
      expenses: ledgerLines
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 20)
        .map((l) => ({
          date: l.date,
          category: l.category,
          what: l.what,
          amountHome: l.amountHome,
        })),
      patronsAvailable: false,
    };
  }
}
