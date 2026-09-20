#!/usr/bin/env node
// Local dev only: prints a one-time-use sign-in link for a test player,
// skipping the real magic-link email round trip. Uses the Supabase Admin
// API (service role) to generate the same kind of link the app would
// normally email — nothing about the app's own auth code changes or is
// bypassed, this just skips waiting on an inbox during development.
//
// Usage: node scripts/dev-sign-in-link.mjs [email] [redirectTo]
// Defaults to the one seeded test player and http://localhost:3000.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function loadRootEnv() {
  const path = fileURLToPath(new URL('../.env', import.meta.url));
  const text = readFileSync(path, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const env = loadRootEnv();
const supabaseUrl = env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the root .env.');
  process.exit(1);
}

const email = process.argv[2] ?? 'manu.dadubey@gmail.com';
const redirectTo = process.argv[3] ?? 'http://localhost:3000';

const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ type: 'magiclink', email, options: { redirect_to: redirectTo } }),
});

if (!response.ok) {
  console.error(`generate_link failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const body = await response.json();
// Not body.action_link: that points at Supabase's own hosted
// /auth/v1/verify endpoint, which auto-verifies on a bare GET. This app's
// /auth/confirm page deliberately refuses to do that (see its own comment —
// an enterprise link scanner prefetching and burning the token before a
// real player clicks it, confirmed live against Gmail) and only verifies
// from a real button click. body.hashed_token is the same token in the
// shape that page actually expects.
const confirmUrl = new URL('/auth/confirm', redirectTo);
confirmUrl.searchParams.set('token_hash', body.hashed_token);
confirmUrl.searchParams.set('type', 'magiclink');

console.log(`Sign-in link for ${email} (single use, expires shortly):\n`);
console.log(confirmUrl.toString());
console.log(
  '\nOpen it in the browser where apps/web is running, then click "Sign in" on that page.',
);
