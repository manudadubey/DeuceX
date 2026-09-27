// The uptime check's target (step 5.4, TECH-ARCHITECTURE.md section 8: "a
// genuinely external uptime check"). .github/workflows/uptime.yml calls this
// from outside Vercel. It answers 200 only when the app is serving and can
// reach Supabase Auth, the one dependency every signed-in page needs; it
// reads no player data and needs no session. Kept out of the middleware's
// matcher so a check never refreshes a session cookie.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const started = Date.now();
  let supabase: 'ok' | 'down' = 'down';
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) supabase = 'ok';
  } catch {
    // reported as down below
  }
  const ok = supabase === 'ok';
  return Response.json(
    { status: ok ? 'ok' : 'degraded', supabase, ms: Date.now() - started },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
