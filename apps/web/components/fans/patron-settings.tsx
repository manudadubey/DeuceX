'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Item,
  ItemDescription,
  ItemTitle,
  Switch,
} from '@procircuit/ui';
import { setPatronNamesLine } from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';

// PRD-04 section 4.3: the Fans pieces that live outside /fans. The Stripe
// row in Settings > Connections, the patron payouts row and count in Plan &
// billing, and the patron page card with P-19's "Patron names" switch on
// /profile. Each reads the player's own patron_programmes row through RLS.

interface ProgrammeState {
  slug: string;
  kyc_status: string;
  names_line_enabled: boolean;
}

function useProgramme(playerId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [programme, setProgramme] = useState<ProgrammeState | null | undefined>(undefined);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase
        .from('patron_programmes')
        .select('slug, kyc_status, names_line_enabled')
        .eq('player_id', playerId)
        .maybeSingle(),
      supabase
        .from('patrons')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .in('status', ['active', 'past_due']),
    ]).then(([p, c]) => {
      if (cancelled) return;
      setProgramme(p.data ?? null);
      setActive(c.count ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, playerId]);
  return { programme, setProgramme, active, supabase };
}

const KYC_LABEL: Record<string, { text: string; variant: 'ok' | 'warn' | 'secondary' }> = {
  complete: { text: 'KYC complete', variant: 'ok' },
  pending: { text: 'Onboarding not finished', variant: 'secondary' },
  action_required: { text: 'Action required', variant: 'warn' },
  not_started: { text: 'Not connected yet', variant: 'secondary' },
};

export function StripeConnectionItem({ playerId }: { playerId: string }) {
  const { programme } = useProgramme(playerId);
  const kyc = KYC_LABEL[programme?.kyc_status ?? 'not_started']!;
  return (
    <Item>
      <div className="flex-1">
        <ItemTitle>Stripe Connect Express</ItemTitle>
        <ItemDescription>
          Patron payments and payouts.{' '}
          <Link href="/fans" className="underline">
            {programme?.kyc_status === 'complete' ? 'See payouts' : 'Set up in Fans'}
          </Link>
        </ItemDescription>
      </div>
      <Badge variant={kyc.variant}>{kyc.text}</Badge>
    </Item>
  );
}

export function PatronPayoutsItem({ playerId, plan }: { playerId: string; plan: string }) {
  const { programme, active } = useProgramme(playerId);
  if (plan === 'free') return null;
  return (
    <Item>
      <div className="flex-1">
        <ItemTitle>Patron payouts · Stripe Connect</ItemTitle>
        <ItemDescription>
          Separate from your plan · weekly, Fridays
          {plan === 'pro'
            ? ` · ${active} of 50 patrons`
            : ` · ${active} patrons, no limit on Elite`}
        </ItemDescription>
      </div>
      <Link href="/fans" className="text-sm underline">
        {programme?.kyc_status === 'complete' ? 'See payouts' : 'Set up'}
      </Link>
    </Item>
  );
}

export function PatronPageCard({
  playerId,
  onToast,
}: {
  playerId: string;
  onToast: (title: string) => void;
}) {
  const { programme, setProgramme, supabase } = useProgramme(playerId);
  const [saving, setSaving] = useState(false);
  if (programme === undefined) return null;

  const toggle = async (enabled: boolean) => {
    if (!programme) return;
    setSaving(true);
    try {
      await setPatronNamesLine(supabase, { playerId, enabled });
      setProgramme({ ...programme, names_line_enabled: enabled });
      onToast(
        enabled
          ? 'Opted-in first names now show on your page'
          : 'No patron names show on your page',
      );
    } catch {
      onToast('That did not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Back the season</CardTitle>
        <CardDescription>
          {programme ? (
            <>
              Your patron page:{' '}
              <Link href={`/p/${programme.slug}`} className="underline">
                /p/{programme.slug}
              </Link>
            </>
          ) : (
            <>
              Switch on patron tiers in{' '}
              <Link href="/fans" className="underline">
                Fans
              </Link>{' '}
              to get a patron page.
            </>
          )}
        </CardDescription>
      </CardHeader>
      {programme ? (
        <div className="flex items-start justify-between gap-4 px-5 pb-5 max-sm:px-4">
          <div>
            <div className="text-sm font-medium">Patron names</div>
            <p className="text-xs text-muted-foreground">
              Patrons can be thanked by first name on the page. Each one opts in at checkout.
            </p>
          </div>
          <Switch
            checked={programme.names_line_enabled}
            disabled={saving}
            onCheckedChange={toggle}
            aria-label="Show opted-in patron first names on your page"
          />
        </div>
      ) : null}
    </Card>
  );
}
