'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@deucex/ui';
import { paragraphs, wordCount } from '@deucex/agents';
import { contentPublishPayload } from '@deucex/shared';
import type { Database } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import { publishDraft } from '@/lib/content/api';
import { dashboardConsequence, patrons } from '@/lib/content/copy';

type UpdateRow = Database['public']['Tables']['patron_updates']['Row'];

// PRD-05 section 4.2, the Today row card. Worksheet 8 (decided 13 September
// 2026): Approve & publish is one tap here, but only because the consequence
// sentence is printed on the card beside the button. It appears only for a
// send-now draft with patrons selected; anything else goes to the full page.

export function ContentAgentCard({
  playerId,
  isFree,
  timezone,
}: {
  playerId: string;
  isFree: boolean;
  /** The player's own time zone, so "Drafted 06:12" matches the Content page. */
  timezone: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<UpdateRow | null>(null);
  const [tierNames, setTierNames] = useState<string>('');
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: rows } = await supabase
      .from('patron_updates')
      .select('*')
      .eq('player_id', playerId)
      .in('status', ['queued', 'drafting', 'draft'])
      .limit(1);
    const row = rows?.[0] ?? null;
    setDraft(row);
    if (row && row.tier_ids.length) {
      const [{ data: tiers }, { data: pats }] = await Promise.all([
        supabase
          .from('patron_tiers')
          .select('id, name, position')
          .in('id', row.tier_ids)
          .order('position'),
        supabase
          .from('patrons')
          .select('id')
          .in('tier_id', row.tier_ids)
          .in('status', ['active', 'past_due'])
          .not('email', 'is', null),
      ]);
      setTierNames((tiers ?? []).map((t) => t.name).join(' + '));
      setCount(pats?.length ?? 0);
    } else {
      setTierNames('');
      setCount(0);
    }
    setLoaded(true);
  }, [supabase, playerId]);

  useEffect(() => {
    if (!isFree) void load();
  }, [isFree, load]);

  const publish = async () => {
    if (!draft) return;
    setState('sending');
    setMessage(null);
    try {
      const payload = contentPublishPayload({
        updateId: draft.id,
        subject: draft.subject,
        body: draft.body,
        practiceSection: draft.practice_section,
        tierIds: draft.tier_ids,
        sendAt: draft.send_at,
        teaser: draft.teaser,
      });
      const approval = await confirmApproval({ playerId, actionType: 'content_publish', payload });
      const result = await publishDraft(supabase, draft.id, approval.id);
      setState('sent');
      setMessage(
        result.status === 'published'
          ? `Published to ${patrons(result.deliveredCount ?? 0)}`
          : 'Send failed. Nothing reached patrons.',
      );
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Nothing was sent.');
    }
  };

  const drafted = draft?.status === 'draft' && !draft.draft_failed;
  const oneTap = drafted && !draft!.send_at && count > 0 && draft!.body.trim().length > 0;
  const time = draft?.drafted_at
    ? new Intl.DateTimeFormat('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: timezone,
      }).format(new Date(draft.drafted_at))
    : null;

  return (
    <Card id="fwContent">
      <CardHeader>
        <CardTitle>Content Agent</CardTitle>
        <CardDescription>
          {isFree
            ? 'Patron updates are on Pro'
            : !loaded
              ? 'Loading…'
              : drafted
                ? `Drafted ${time ?? ''} from your latest note`
                : draft
                  ? draft.status === 'draft'
                    ? 'The agent could not draft this one'
                    : 'Drafting from your latest note'
                  : 'Waiting for your next match note'}
        </CardDescription>
        {drafted && state !== 'sent' ? (
          <CardActions>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="lime">Approve</Badge>
              </TooltipTrigger>
              <TooltipContent>
                Nothing is sent to patrons until you approve it here or on the Content page
              </TooltipContent>
            </Tooltip>
          </CardActions>
        ) : null}
      </CardHeader>

      {isFree ? (
        <Empty title="Drafted in your voice">
          Updates for your patrons after every match.{' '}
          <Link href="/agent/content" className="font-medium text-foreground underline">
            See how it works
          </Link>
        </Empty>
      ) : state === 'sent' ? (
        <div className="grid gap-2 px-5 pb-5 text-sm max-sm:px-4">
          <p className="font-medium">{message}</p>
          <Link
            href="/agent/content"
            className="text-muted-foreground underline underline-offset-4"
          >
            See it on the Content page
          </Link>
        </div>
      ) : !draft || !drafted ? (
        <Empty title={draft ? 'Draft needs you' : 'Nothing to draft yet'}>
          {draft ? (
            <Link href="/agent/content" className="font-medium text-foreground underline">
              Open the Content Agent
            </Link>
          ) : (
            'Sixty seconds after a match is all it needs.'
          )}
        </Empty>
      ) : (
        <div className="grid gap-3 px-5 pb-5 max-sm:px-4">
          <p className="text-[0.9375rem] font-medium">{draft.subject}</p>
          <p className="line-clamp-3 text-sm text-muted-foreground">{paragraphs(draft.body)[0]}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{wordCount(draft.body)} words</Badge>
            {tierNames ? <Badge variant="secondary">{tierNames}</Badge> : null}
          </div>
          {oneTap ? (
            <>
              <p className="text-[0.8125rem] text-muted-foreground">
                {dashboardConsequence(count)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={publish} disabled={state === 'sending'}>
                  {state === 'sending' ? <Spinner /> : null}
                  Approve &amp; publish
                </Button>
                <Link href="/agent/content" className={buttonVariants({ variant: 'outline' })}>
                  Edit
                </Link>
              </div>
            </>
          ) : (
            <Link
              href="/agent/content"
              className={buttonVariants({ variant: 'outline', className: 'w-fit' })}
            >
              Review on the Content page
            </Link>
          )}
          {state === 'error' && message ? <p className="text-sm text-danger">{message}</p> : null}
        </div>
      )}
    </Card>
  );
}
