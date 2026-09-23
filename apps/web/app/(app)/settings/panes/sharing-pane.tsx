'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, CardTitle } from '@procircuit/ui';
import { createShareLink, renewShareLink, revokeShareLink, type Database } from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';

type ShareLink = Database['public']['Tables']['share_links']['Row'];

const SCOPE_COPY: Record<
  'coach' | 'manager',
  { title: string; included: string[]; excluded: string[] }
> = {
  coach: {
    title: 'Coach',
    included: ['Matches', 'Shortlists', 'Patterns'],
    excluded: ['Transcripts', 'Money'],
  },
  manager: {
    title: 'Parent/manager',
    included: ['Runway & P&L', 'Expenses', 'Patrons'],
    excluded: ['Notes', 'Agent drafts'],
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function coachLink(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/coach/${token}`;
}

// PRD-12 §4.9, §10; ST-14 to ST-16; decisions worksheet 12 (expiry shown).
// Create/revoke/renew are plain RLS-scoped writes through
// packages/db/src/sharing.ts (no vendor call); only *opening* a link is a
// service-role apps/api round trip (the coach/manager visitor has no
// session) — see apps/api/src/sharing.
export function SharingPane({
  playerId,
  shareLinks,
  onShareLinksChange,
  onToast,
}: {
  playerId: string;
  shareLinks: ShareLink[];
  onShareLinksChange: (rows: ShareLink[]) => void;
  onToast: (title: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  function activeLink(scope: 'coach' | 'manager'): ShareLink | null {
    return (
      shareLinks.find(
        (l) => l.scope === scope && !l.revoked && new Date(l.expires_at).getTime() > Date.now(),
      ) ?? null
    );
  }

  async function handleCreate(scope: 'coach' | 'manager') {
    setBusy(scope);
    try {
      const supabase = createClient();
      const link = await createShareLink(supabase, { playerId, scope });
      onShareLinksChange([link, ...shareLinks]);
      onToast(`New ${SCOPE_COPY[scope].title.toLowerCase()} link created`);
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(link: ShareLink) {
    setBusy(link.id);
    try {
      const supabase = createClient();
      await revokeShareLink(supabase, link.id);
      onShareLinksChange(shareLinks.map((l) => (l.id === link.id ? { ...l, revoked: true } : l)));
      onToast(`${SCOPE_COPY[link.scope as 'coach' | 'manager'].title} link revoked`);
    } finally {
      setBusy(null);
    }
  }

  async function handleRenew(link: ShareLink) {
    setBusy(link.id);
    try {
      const supabase = createClient();
      const renewed = await renewShareLink(supabase, link.id);
      onShareLinksChange(shareLinks.map((l) => (l.id === link.id ? renewed : l)));
      onToast(`Link renewed · now expires ${formatDate(renewed.expires_at)}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy(link: ShareLink) {
    try {
      await navigator.clipboard.writeText(coachLink(link.token));
      onToast('Copied link');
    } catch {
      onToast('Could not copy — copy it from the address bar on Preview instead');
    }
  }

  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Sharing</CardTitle>
      </CardHeader>

      <div className="flex flex-col gap-4">
        {(['coach', 'manager'] as const).map((scope) => {
          const link = activeLink(scope);
          const copy = SCOPE_COPY[scope];
          return (
            <div key={scope} className="rounded-lg bg-secondary/50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{copy.title} link</span>
                <Badge variant={link ? 'ok' : 'secondary'}>{link ? 'Active' : 'None yet'}</Badge>
              </div>

              {link ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Opened {link.open_count} time{link.open_count === 1 ? '' : 's'}
                    {link.last_opened_at ? ` · last ${formatDate(link.last_opened_at)}` : ''} ·
                    expires {formatDate(link.expires_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {copy.included.map((s) => (
                      <span key={s} className="rounded-full bg-background px-2 py-0.5 text-xs">
                        ✓ {s}
                      </span>
                    ))}
                    {copy.excluded.map((s) => (
                      <span
                        key={s}
                        className="rounded-full bg-background px-2 py-0.5 text-xs opacity-50"
                      >
                        ✗ {s}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleCopy(link)}>
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === link.id}
                      onClick={() => handleRenew(link)}
                    >
                      Renew
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === link.id}
                      onClick={() => handleRevoke(link)}
                    >
                      Revoke
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={busy === scope}
                  onClick={() => handleCreate(scope)}
                >
                  Create {copy.title.toLowerCase()} link
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
