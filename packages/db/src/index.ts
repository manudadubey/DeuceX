import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Two clients, deliberately: the anon-scoped client respects row-level
// security and is what every player-facing request uses; the service-role
// client bypasses RLS and is only ever used by trusted server-side jobs
// (migrations, the queue worker, the admin console's own limited role).
// See TECH-ARCHITECTURE.md section 6.

export function createAnonClient(supabaseUrl: string, anonKey: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey);
}

export function createServiceRoleClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
