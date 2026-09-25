'use client';

import { useEffect, useState } from 'react';
import { Badge, Empty } from '@deucex/ui';
import { listAuditLog, type AuditLogEntry } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';

// Plain-English names for what an approval or a staff action did. Unknown
// types fall back to their key with spaces, never a blank row.
const LABELS: Record<string, string> = {
  expense_save: 'Saved an expense',
  balance_update: 'Updated your balance',
  receivable_received: 'Marked prize money received',
  entry_confirm: 'Confirmed a tournament entry',
  retract: 'Withdrew a tournament entry',
  account_deletion_request: 'Asked to delete your account',
  data_export_request: 'Asked for a data export',
  content_publish: 'Published a patron update',
  connect_onboard: 'Started patron payouts setup',
  waitlist_invite: 'Invited someone from the waitlist',
  patron_billing_pause: 'Paused patron billing',
  patron_billing_resume: 'Resumed patron billing',
  magic_link: 'Sent you a sign-in link',
  reverify: 'Re-checked your ranking',
  trial_extend: 'Extended your trial',
  comp: 'Gave you Elite free',
  pause_agents: 'Paused your agents',
  resume_agents: 'Resumed your agents',
  export_data: 'Sent you a data export',
  delete_account: 'Started deleting your account',
  cancel_deletion: 'Cancelled your account deletion',
  revoke_share_link: 'Revoked a share link',
  offer_elite: 'Offered you Elite',
  run_retry: 'Retried an agent run',
  run_dismiss: 'Closed a failed agent run',
  case_resolve: 'Resolved a support case',
};

function label(action: string): string {
  return LABELS[action] ?? action.replace(/_/g, ' ');
}

// PRD-13 AD-4: every staff action on your account appears here, marked as
// an admin action with the staff member's name, role and reason.
export function AuditLogSection({ playerId }: { playerId: string }) {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAuditLog(createClient(), playerId)
      .then(setEntries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [playerId]);

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">Activity log</h3>
        <p className="text-sm text-muted-foreground">
          Everything you approved, and anything DeuceX staff did on your account, newest first.
          Staff actions show the person&rsquo;s name, role and reason.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : entries === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <Empty title="Nothing yet">
          Approvals you give and any staff action on your account appear here.
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg shadow-[0_0_0_1px_var(--border)]">
          {entries.map((e) => (
            <li key={`${e.actor}-${e.id}`} className="flex flex-col gap-0.5 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                {e.actor === 'admin' ? (
                  <Badge variant="warn">Admin</Badge>
                ) : (
                  <Badge variant="secondary">You</Badge>
                )}
                <span className="font-medium">{label(e.action)}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {new Date(e.at).toLocaleString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {e.actor === 'admin' ? (
                <p className="text-muted-foreground">
                  {e.adminName ?? 'DeuceX staff'}, {e.adminRole}
                  {e.reason ? `: “${e.reason}”` : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
