import { redirect } from 'next/navigation';
import { getMe } from '@/lib/server-api';
import { createClient } from '@/lib/supabase/server';
import { BareCard } from '../bare-card';
import { PasskeyStep } from './passkey-step';

// The mandatory passkey (PRD-13 AD-1). A staff member who arrived by magic
// link registers a passkey once, then confirms with it; every later
// session must itself be opened with the passkey, which the API checks.
export default async function PasskeyPage() {
  const { data } = await createClient().auth.getClaims();
  if (!data?.claims) redirect('/signin');
  const me = await getMe();
  if (!me) {
    return (
      <BareCard title="No console access">
        <p className="text-sm text-muted-foreground">
          This account holds no console role. Staff roles are granted by the owner, and a player
          account can never hold one.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm font-medium underline">
            Sign out
          </button>
        </form>
      </BareCard>
    );
  }
  if (me.passkeyRegistered && me.passkeySession) redirect('/');

  return (
    <BareCard title={me.passkeyRegistered ? 'Confirm with your passkey' : 'Register a passkey'}>
      <PasskeyStep name={me.name} registered={me.passkeyRegistered} />
    </BareCard>
  );
}
