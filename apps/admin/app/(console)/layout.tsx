import { redirect } from 'next/navigation';
import { ConsoleShell } from '@/components/shell/console-shell';
import { getMe, serverApi } from '@/lib/server-api';

interface NavCounts {
  players: number;
  failures: number;
  cases: number;
  feeds: number;
  unread: number;
}

// Every console page sits behind a staff session opened with a passkey
// (PRD-13 AD-1). Areas outside the acting role never reach the shell's
// navigation (AD-2); each page also guards itself (lib/server-api.ts's
// requireArea) and the API refuses them regardless.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/signin');
  if (!me.passkeyRegistered || !me.passkeySession) redirect('/passkey');

  const counts = await serverApi<NavCounts>('/admin/nav-counts');

  return (
    <ConsoleShell
      me={{ name: me.name, email: me.email, role: me.role, actingRole: me.actingRole }}
      areas={me.areas}
      counts={{
        players: { value: counts.players, tone: 'secondary' },
        agents: { value: counts.failures, tone: 'danger' },
        ingestion: { value: counts.feeds, tone: 'warn' },
        trust: { value: counts.cases, tone: 'warn' },
      }}
      environment={process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL ?? 'Production · ap-northeast-1'}
      unreadAlerts={counts.unread}
    >
      {children}
    </ConsoleShell>
  );
}
