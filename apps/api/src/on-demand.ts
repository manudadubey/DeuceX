import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { ON_DEMAND_NOUNS, ON_DEMAND_WINDOW_MS, limitFor, type OnDemandKind } from '@deucex/shared';
import type { FastifyReply } from 'fastify';

// Per-tier rate limits on on-demand model calls (step 5.4, TECH-ARCHITECTURE.md
// section 5's fourth fix: "so a heavy user cannot single-handedly blow the
// average"). Each on-demand route calls claim() after authenticating and
// before any upload or model call. A request that passes is recorded; one
// over the limit is refused with 429 and the time the oldest request in the
// window ages out. Count-then-record isn't atomic, so two simultaneous
// requests at the limit can both pass: the limit is a spend guard, not a
// security boundary, and that slack is one request.

export interface OnDemandWindow {
  count: number;
  /** requested_at of the oldest request still inside the window. */
  oldest: string | null;
}

export interface OnDemandDb {
  getPlayer(playerId: string): Promise<{ tier: string | null; timezone: string } | null>;
  windowSince(playerId: string, kind: OnDemandKind, since: Date): Promise<OnDemandWindow>;
  record(playerId: string, kind: OnDemandKind, at: Date): Promise<void>;
}

export type OnDemandDecision =
  { allowed: true } | { allowed: false; limit: number; availableAt: string; message: string };

export interface OnDemandLimiter {
  claim(playerId: string, kind: OnDemandKind): Promise<OnDemandDecision>;
}

function formatAvailableAt(at: Date, timezone: string): string {
  const time = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  const day = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
  }).format(at);
  return `${time} on ${day}`;
}

export function createOnDemandLimiter(
  db: OnDemandDb,
  now: () => Date = () => new Date(),
): OnDemandLimiter {
  return {
    async claim(playerId, kind) {
      const at = now();
      const player = await db.getPlayer(playerId);
      const limit = limitFor(player?.tier ?? null, kind);
      const window = await db.windowSince(
        playerId,
        kind,
        new Date(at.getTime() - ON_DEMAND_WINDOW_MS),
      );
      if (window.count >= limit) {
        const oldest = window.oldest ? new Date(window.oldest) : at;
        const availableAt = new Date(oldest.getTime() + ON_DEMAND_WINDOW_MS);
        const timezone = player?.timezone ?? 'UTC';
        return {
          allowed: false,
          limit,
          availableAt: availableAt.toISOString(),
          message: `You've used all ${limit} ${ON_DEMAND_NOUNS[kind]} for the last 24 hours. The next one is available at ${formatAvailableAt(availableAt, timezone)} (${timezone} time).`,
        };
      }
      await db.record(playerId, kind, at);
      return { allowed: true };
    },
  };
}

/** Sends the 429 for a refused claim. Returns true when the route should stop. */
export function refuseIfLimited(reply: FastifyReply, decision: OnDemandDecision): boolean {
  if (decision.allowed) return false;
  // `error` carries the sentence itself, the same field every other route's
  // human-readable failure uses, so any client that shows `error` shows this.
  void reply.code(429).send({
    error: decision.message,
    code: 'rate_limited',
    limit: decision.limit,
    availableAt: decision.availableAt,
  });
  return true;
}

/** For routes whose errors go through a shared mapper (content). */
export class OnDemandLimitError extends Error {
  constructor(readonly decision: Extract<OnDemandDecision, { allowed: false }>) {
    super(decision.message);
    this.name = 'OnDemandLimitError';
  }
}

/** For route tests that aren't about limits. */
export const allowAllOnDemand: OnDemandLimiter = {
  async claim() {
    return { allowed: true };
  },
};

export class SupabaseOnDemandDb implements OnDemandDb {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getPlayer(playerId: string) {
    const { data, error } = await this.client
      .from('players')
      .select('tier, timezone')
      .eq('id', playerId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async windowSince(playerId: string, kind: OnDemandKind, since: Date): Promise<OnDemandWindow> {
    const { data, count, error } = await this.client
      .from('on_demand_requests')
      .select('requested_at', { count: 'exact' })
      .eq('player_id', playerId)
      .eq('kind', kind)
      .gte('requested_at', since.toISOString())
      .order('requested_at', { ascending: true })
      .limit(1);
    if (error) throw error;
    return { count: count ?? 0, oldest: data?.[0]?.requested_at ?? null };
  }

  async record(playerId: string, kind: OnDemandKind, at: Date): Promise<void> {
    const { error } = await this.client
      .from('on_demand_requests')
      .insert({ player_id: playerId, kind, requested_at: at.toISOString() });
    if (error) throw error;
  }
}
