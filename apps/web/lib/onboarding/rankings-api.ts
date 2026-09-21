'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';

// The one apps/api call onboarding makes (step 1.4's ranking lookup adapter
// — see apps/api/src/rankings). Everything else onboarding does is the
// single finishOnboarding insert via packages/db, a direct Supabase call.
// See TECH-ARCHITECTURE.md section 1 and apps/web/lib/match-scribe/api.ts
// for the same split.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class RankingLookupError extends Error {}

export interface RankingLookupInput {
  tour: 'atp' | 'wta';
  tourPlayerId: string | null;
  itfId: string | null;
  name: string;
  country: string;
}

export interface RankingCandidate {
  id: string;
  name: string;
  country: string;
  tourRank: number | null;
  itfRank: number | null;
}

export type RankingLookupResult =
  | {
      status: 'verified';
      source: string;
      tourRank: number;
      tourPoints: number;
      itfRank: number | null;
      wtn: number | null;
    }
  | { status: 'ambiguous'; candidates: RankingCandidate[] }
  | { status: 'unverified' };

export async function lookupRanking(
  supabase: SupabaseClient<Database>,
  input: RankingLookupInput,
): Promise<RankingLookupResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new RankingLookupError('Not signed in');

  const res = await fetch(`${API_URL}/rankings/lookup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new RankingLookupError(`Ranking lookup failed: ${res.status}`);
  const body = (await res.json()) as { result: RankingLookupResult };
  return body.result;
}
