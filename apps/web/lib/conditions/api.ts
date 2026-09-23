'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';

// CE-15: "saving [the equipment profile] triggers a re-run of every current
// brief." The profile write itself is a direct RLS-scoped Supabase call
// (packages/db's upsertEquipmentProfile, same split as
// apps/web/lib/financial/api.ts's own requestFinancialRecompute comment);
// this is the one apps/api call, fire-and-forget from the caller's
// perspective for the same reason that one is.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export async function requestConditionsReRun(supabase: SupabaseClient<Database>): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(`${API_URL}/conditions/re-run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.warn('[conditions] re-run request failed (non-fatal):', err);
  }
}
