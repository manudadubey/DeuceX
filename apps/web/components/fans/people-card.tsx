'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  BadgeDot,
  Button,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Flag,
  type FlagCode,
  InputGroup,
  InputGroupInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@procircuit/ui';
import { patronNoteOpening } from '@procircuit/agents';
import { pausedMembershipEndDate } from '@procircuit/shared';
import { createClient } from '@/lib/supabase/client';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import { draftPatronNote, sendPatronNote } from '@/lib/fans/api';
import type { FansPatronView, FansTierView } from '@/lib/fans/load';

// PRD-04 section 4.1's People card (P-8, P-9, P-10, P-11). One row per
// patron, one state badge at most, one action. The composer is the approval
// gate: the drafted text is editable, the provenance line under it is shown
// verbatim, and "Send to <first name>" is the player's tap that creates the
// patron_send approval before apps/api sends anything.

const PROVENANCE =
  'Opening line drafted by the Content Agent in your voice. Sent from you, by email, not through the agent.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthYear(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function dayMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// Stripe returns ISO 3166 alpha-2; the flag sprite is keyed by the codes
// Baseline ships. Unlisted countries simply show no flag.
const FLAG_BY_ISO2: Record<string, FlagCode> = {
  AT: 'AUT',
  PL: 'POL',
  RO: 'ROU',
  SK: 'SVK',
  PT: 'POR',
  TR: 'TUR',
  IT: 'ITA',
  CZ: 'CZE',
  CN: 'CHN',
  AU: 'AUS',
  CH: 'SUI',
  DE: 'GER',
  ES: 'ESP',
  US: 'USA',
  FR: 'FRA',
};

function initials(displayName: string): string {
  return displayName
    .replace('.', '')
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function StateBadge({ patron }: { patron: FansPatronView }) {
  if (patron.status === 'left' && patron.leftAt) {
    return <Badge variant="secondary">Left {dayMonth(patron.leftAt)}</Badge>;
  }
  if (patron.status === 'paused') {
    return (
      <Badge variant="secondary">
        Paused
        {patron.pausedAt ? ` · ends ${pausedMembershipEndDate(new Date(patron.pausedAt))}` : ''}
      </Badge>
    );
  }
  if (patron.flag === 'card') {
    return (
      <Badge variant="danger">
        <BadgeDot />
        Payment failed
      </Badge>
    );
  }
  if (patron.flag === 'quiet') {
    return (
      <Badge variant="warn">
        <BadgeDot />
        Gone quiet
      </Badge>
    );
  }
  if (patron.flag === 'new') {
    return (
      <Badge variant="lime">
        <BadgeDot />
        New
      </Badge>
    );
  }
  return null;
}

/** Six squares, most recent last. Grey when no open data exists yet (PRD-04 section 3 failure behaviour). */
function OpenStrip({ patron }: { patron: FansPatronView }) {
  const squares = [
    ...Array<null>(Math.max(0, 6 - patron.opens.length)).fill(null),
    ...patron.opens,
  ].slice(-6);
  const noData = patron.delivered === 0;
  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      title={noData ? 'Open data not yet received' : 'Opened last six updates'}
    >
      <div className="flex gap-0.5" aria-hidden="true">
        {squares.map((o, i) => (
          <i
            key={i}
            className="block size-2.5 rounded-[3px]"
            style={{
              background: o === 1 ? 'var(--chart-2)' : 'var(--muted)',
              opacity: o === null ? 0.35 : 1,
            }}
          />
        ))}
      </div>
      <span>{noData ? 'No updates yet' : `${patron.opened} of ${patron.delivered} opened`}</span>
    </div>
  );
}

function Composer({
  playerId,
  patron,
  onClose,
  onSent,
}: {
  playerId: string;
  patron: FansPatronView;
  onClose: () => void;
  onSent: (title: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<'drafting' | 'ready' | 'sending'>('drafting');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // P-10: drafted on tap, never in bulk (apps/api caches it per patron and kind).
  useEffect(() => {
    let cancelled = false;
    draftPatronNote(supabase, patron.id)
      .then((result) => {
        if (cancelled) return;
        setDraft(result.text);
        setText(result.text ?? '');
        setFailed(result.text === null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setState('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, patron.id]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setState('sending');
    setError(null);
    try {
      const payload = { patronId: patron.id, kind: patron.noteKind, text };
      const approval = await confirmApproval({ playerId, actionType: 'patron_send', payload });
      await sendPatronNote(supabase, patron.id, {
        approvalId: approval.id,
        kind: patron.noteKind,
        text,
        draftText: draft,
      });
      onSent(`Sent to ${patron.displayName}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The note was not sent.');
      setState('ready');
    }
  };

  if (state === 'drafting') {
    return (
      <div className="col-span-full flex items-center gap-2 pt-3 text-sm text-muted-foreground">
        <Spinner /> Drafting a note in your voice…
      </div>
    );
  }

  return (
    <div className="col-span-full grid gap-2 pt-3">
      {failed ? (
        <p className="text-sm text-muted-foreground">
          Write it yourself; the agent couldn&apos;t draft this one.
        </p>
      ) : null}
      <Textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Note to ${patron.displayName}`}
        placeholder={
          failed
            ? patronNoteOpening({
                kind: patron.noteKind,
                playerFirstName: '',
                patronFirstName: patron.firstName,
                tierName: patron.tierName,
                tenureMonths: patron.tenureMonths,
                otherPatronFirstNames: [],
              })
            : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-muted-foreground">{PROVENANCE}</span>
        <Button size="sm" variant="outline" onClick={onClose} disabled={state === 'sending'}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={send}
          disabled={state === 'sending' || !text.trim() || !patron.hasEmail}
        >
          {state === 'sending' ? 'Sending…' : `Send to ${patron.firstName}`}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        One email to {patron.displayName} only, sent now from your name. Replies come to your own
        inbox. It can&apos;t be recalled once sent.
      </p>
      {!patron.hasEmail ? (
        <p className="text-xs text-danger">
          Stripe didn&apos;t share an email for this patron, so a note can&apos;t be sent.
        </p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

type Filter = 'all' | 'attention' | string;

export function PeopleCard({
  playerId,
  patrons,
  tiers,
  locked,
  onToast,
}: {
  playerId: string;
  patrons: FansPatronView[];
  tiers: FansTierView[];
  locked?: boolean;
  onToast: (title: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const list = patrons.filter(
    (p) =>
      (filter === 'all' || (filter === 'attention' ? p.attention : p.tierId === filter)) &&
      (!q || `${p.name} ${p.city ?? ''}`.toLowerCase().includes(q)),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>
          Who they are, how long they&apos;ve been here, and whether they&apos;re still reading.
          Squares are your last six updates.
        </CardDescription>
        <CardActions>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList aria-label="Filter patrons" className="max-w-full overflow-x-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              {tiers.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.name}
                </TabsTrigger>
              ))}
              <TabsTrigger value="attention">Needs attention</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardActions>
      </CardHeader>
      <div className="px-5 pb-3 max-sm:px-4">
        <InputGroup className="max-w-[21rem]">
          <svg
            className="size-4 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or city"
            aria-label="Search patrons"
          />
        </InputGroup>
      </div>
      <div className="grid">
        {list.length === 0 ? (
          filter === 'attention' && !q ? (
            <Empty title="Everyone's reading.">Nothing to do here.</Empty>
          ) : (
            <Empty title="No one matches">Try another name or clear the filter.</Empty>
          )
        ) : (
          list.map((p) => (
            <div
              key={p.id}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 border-t border-border px-5 py-3 max-sm:px-4 ${p.status === 'left' ? 'opacity-70' : ''}`}
            >
              <div
                className="row-span-2 grid size-9 place-items-center rounded-full text-xs font-semibold text-background"
                style={{ background: p.colour }}
                aria-hidden="true"
              >
                {initials(p.displayName)}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-medium">
                {p.displayName}
                <Badge style={{ color: p.colour }}>{p.tierName}</Badge>
                <StateBadge patron={p} />
              </div>
              <div className="row-span-2 flex flex-col items-end gap-1.5 max-sm:col-span-full max-sm:row-span-1 max-sm:flex-row max-sm:items-center max-sm:justify-between">
                <OpenStrip patron={p} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locked}
                  onClick={() => setOpenId(openId === p.id ? null : p.id)}
                >
                  {p.actionLabel}
                </Button>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {p.country && FLAG_BY_ISO2[p.country] ? (
                  <Flag code={FLAG_BY_ISO2[p.country]!} />
                ) : null}
                {[
                  p.city,
                  `since ${monthYear(p.since)}`,
                  p.tenureMonths ? `${p.tenureMonths} months` : null,
                  p.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {openId === p.id && !locked ? (
                <Composer
                  playerId={playerId}
                  patron={p}
                  onClose={() => setOpenId(null)}
                  onSent={onToast}
                />
              ) : null}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
