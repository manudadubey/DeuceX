import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@deucex/db';

// Next 14's cookies() is synchronous (this becomes async under Next 15+,
// which apps/web isn't on yet). Server Components can't write cookies, so
// setAll here is a no-op there; middleware.ts is what actually refreshes and
// persists a rotated session.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
