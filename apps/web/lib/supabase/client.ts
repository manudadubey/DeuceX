import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@procircuit/db';

// Passkey support is still an experimental supabase-js API (opt-in flag
// required), used only here since registerPasskey/signInWithPasskey run in
// the browser via navigator.credentials.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { experimental: { passkey: true } } },
  );
}
