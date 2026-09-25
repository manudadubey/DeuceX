import { createBrowserClient } from '@supabase/ssr';
import { ADMIN_AUTH_COOKIE } from './cookie';

// Passkeys are still an experimental supabase-js API (opt-in flag), used
// here for staff enrolment and sign-in, exactly as apps/web does.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { name: ADMIN_AUTH_COOKIE },
      auth: { experimental: { passkey: true } },
    },
  );
}
