// The erasure drill (step 5.4's third "done when": the erasure job produces
// a completion record). Runs the real sweep (sweepDueDeletions with
// SupabaseAccountDeletionSweepDb) against the STAGING project only: it
// creates a fixture player whose deletion date has passed, gives them the
// rows that used to block the cascade (a paid payout, a staff audit row) plus
// notes and patrons, runs the sweep, then prints the erasure_records row and
// checks nothing of the player is left.
//
// Stripe is a stub here that reports one cancelled membership: the fixture
// has no real connected account, and the Stripe side is covered by
// packages/actions' fans.test.ts. Storage is in memory for the same reason.
//
// Usage: pnpm --filter @deucex/api exec tsx scripts/erasure-drill.ts
// Needs STAGING_SUPABASE_URL and STAGING_SUPABASE_SECRET_KEY in the repo's
// .env. Refuses to run against any other project.

import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import type { Database } from '@deucex/db';
import { SupabaseAccountDeletionSweepDb, sweepDueDeletions } from '../src/account/scheduler';
import { createMemoryStorageAdapter } from '../src/storage/memory-adapter';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const STAGING_REF = 'asbrrmrhxmlvmvlwitmr';
const url = process.env.STAGING_SUPABASE_URL ?? '';
// A pasted key can pick up a line break; no valid key contains whitespace.
const key = (process.env.STAGING_SUPABASE_SECRET_KEY ?? '').replace(/\s+/g, '');
if (!url.includes(STAGING_REF) || !key) {
  throw new Error(
    `Set STAGING_SUPABASE_URL (the ${STAGING_REF} project) and STAGING_SUPABASE_SECRET_KEY`,
  );
}
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

async function main(): Promise<void> {
  const stamp = Date.now();
  const email = `erasure.drill.${stamp}@example.test`;
  const staffEmail = `erasure.staff.${stamp}@example.test`;

  const { data: user, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !user.user) throw error ?? new Error('no user');
  const playerId = user.user.id;
  const { data: staff, error: staffError } = await db.auth.admin.createUser({
    email: staffEmail,
    email_confirm: true,
  });
  if (staffError || !staff.user) throw staffError ?? new Error('no staff user');

  const past = new Date(Date.now() - 60_000).toISOString();
  await must(
    db.from('players').insert({
      id: playerId,
      tour: 'wta',
      name: 'Erasure Drill (fixture)',
      email,
      country: 'AUS',
      dob: '2000-01-01',
      home_currency: 'AUD',
      app_language: 'en',
      units: 'metric',
      timezone: 'Australia/Sydney',
      tier: 'pro',
      deletion_requested_at: new Date(Date.now() - 15 * 86_400_000).toISOString(),
      deletion_effective_at: past,
    }),
  );
  await must(
    db
      .from('admin_users')
      .insert({ id: staff.user.id, name: 'Drill Staff', email: staffEmail, role: 'owner' }),
  );
  await must(
    db.from('admin_actions').insert({
      admin_id: staff.user.id,
      role_at_time: 'owner',
      player_id: playerId,
      action_type: 'send_magic_link',
      consequence: 'Sent a sign-in link',
    }),
  );
  await must(
    db.from('payouts').insert({
      player_id: playerId,
      stripe_payout_id: `po_drill_${stamp}`,
      friday: '2026-09-25',
      gross: 100,
      platform_fee: 8,
      platform_fee_rate: 0.08,
      stripe_fee: 2,
      net: 90,
      currency: 'AUD',
      status: 'paid',
      paid_at: new Date().toISOString(),
    }),
  );
  await must(
    db.from('notes').insert({
      player_id: playerId,
      ctx: 'match',
      status: 'saved',
      transcript: 'fixture note',
      audio_ref: `notes/${playerId}/drill.webm`,
    }),
  );

  const storage = createMemoryStorageAdapter();
  await storage.upload({
    key: `notes/${playerId}/drill.webm`,
    body: Buffer.from('audio'),
    contentType: 'audio/webm',
  });

  const result = await sweepDueDeletions(
    {
      db: new SupabaseAccountDeletionSweepDb(db),
      storage,
      endMemberships: async () => ({ programme: true, cancelled: 1, notified: 1, failed: [] }),
    },
    new Date(),
  );

  const record = await must(
    db.from('erasure_records').select('*').eq('player_id', playerId).maybeSingle(),
  );
  const left = await Promise.all(
    (['players', 'notes', 'payouts'] as const).map(async (t) => {
      const q = db.from(t).select('*', { count: 'exact', head: true });
      const { count } = await (t === 'players'
        ? q.eq('id' as never, playerId as never)
        : q.eq('player_id' as never, playerId as never));
      return `${t}=${count ?? 0}`;
    }),
  );
  const audit = await must(
    db.from('admin_actions').select('id, player_id').eq('admin_id', staff.user.id),
  );

  console.log(JSON.stringify({ result, record, left, auditRows: audit }, null, 2));

  // Tidy the staff fixture; the audit row stays, de-identified, as it would in production.
  await db
    .from('admin_users')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', staff.user.id);

  const ok =
    result.deletedPlayerIds.includes(playerId) &&
    record?.status === 'completed' &&
    left.every((l) => l.endsWith('=0')) &&
    (audit ?? []).every((a) => a.player_id === null);
  console.log(ok ? 'PASS' : 'FAIL');
  if (!ok) process.exitCode = 1;
}

await main();
