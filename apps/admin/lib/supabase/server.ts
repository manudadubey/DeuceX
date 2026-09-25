import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ADMIN_AUTH_COOKIE } from './cookie';

// Same shape as apps/web/lib/supabase/server.ts, with the console's own
// cookie name. Server Components can't write cookies; middleware.ts
// refreshes and persists a rotated session.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { name: ADMIN_AUTH_COOKIE },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; middleware.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
