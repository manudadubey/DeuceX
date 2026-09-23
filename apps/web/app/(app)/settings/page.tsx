import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsShell } from './settings-shell';

// Session already gated by (app)/layout.tsx. Settings reads the whole
// players row (every pane needs a slice of it) plus agent_schedules and
// share_links once, here, the same "one server read, client owns the rest"
// split every other route in this app already uses (financial/page.tsx,
// mindset/page.tsx).
export default async function SettingsPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = typeof data?.claims.sub === 'string' ? data.claims.sub : undefined;
  if (!playerId) redirect('/signin');

  const [{ data: player }, { data: agentSchedules }, { data: shareLinks }] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    supabase.from('agent_schedules').select('*').eq('player_id', playerId),
    supabase
      .from('share_links')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),
  ]);
  if (!player) redirect('/onboarding');

  return (
    <SettingsShell
      player={player}
      agentSchedules={agentSchedules ?? []}
      shareLinks={shareLinks ?? []}
    />
  );
}
