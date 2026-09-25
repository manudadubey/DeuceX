'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import { UNREADABLE_MESSAGE, type FuelAvoid, type FuelMode, type FuelPick } from '@deucex/agents';

// Fuel's one apps/api call: the menu scan, which has the only vendor side
// effect (the vision model). Logging, un-logging, outcomes and the profile
// are direct RLS-scoped calls through packages/db's fuel.ts.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// PRD-07's target is a median under 20 seconds; this is the ceiling after
// which the card gives up and returns to the scan state.
const SCAN_TIMEOUT_MS = 45_000;

export class FuelApiError extends Error {}
export class MenuUnreadableError extends Error {}

export interface ScanResult {
  id: string;
  venueName: string | null;
  venueType: string | null;
  languages: string[];
  dishesRead: number;
  menuCurrency: string | null;
  homeCurrency: string;
  rate: number | null;
  rateDate: string | null;
  mode: FuelMode;
  picks: FuelPick[];
  avoid: FuelAvoid[];
  fewerThanTwo: boolean;
  secondVisit: string | null;
  city: string | null;
  foodMoneyLeft: number | null;
}

export async function scanMenu(
  supabase: SupabaseClient<Database>,
  files: File[],
): Promise<ScanResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FuelApiError('Not signed in');

  const form = new FormData();
  files.forEach((f, i) => form.append('page', f, f.name || `menu-${i + 1}.jpg`));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/fuel/scans`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
    if (res.status === 422) throw new MenuUnreadableError(UNREADABLE_MESSAGE);
    if (!res.ok) throw new FuelApiError(`Menu scan failed: ${res.status}`);
    return (await res.json()) as ScanResult;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new MenuUnreadableError('That took too long. Try again, one page at a time.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
