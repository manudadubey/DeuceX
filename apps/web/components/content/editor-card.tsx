'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  BadgeDot,
  Button,
  buttonVariants,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Confirm,
  Input,
  Spinner,
  Textarea,
} from '@deucex/ui';
import { countLine, type RewriteVariant, type SendTimeOption } from '@deucex/agents';
import type { PatronUpdate } from '@/lib/content/api';
import { confirmDetail, confirmTitle, patrons, SKIP_REASONS } from '@/lib/content/copy';

// PRD-05 section 4.1's editor card (#caEditor): subject with two alternatives,
// the rewrite tools, the autosaved body with its live count, "Built from",
// and a footer whose state follows the update's status. The confirm block is
// the page's two-step gate (worksheet 8 keeps two steps here).

const STATUS_BADGE: Record<
  string,
  { label: string; variant: 'lime' | 'ok' | 'secondary' | 'danger' | 'warn' }
> = {
  queued: { label: 'Waiting for the window', variant: 'secondary' },
  drafting: { label: 'Drafting', variant: 'secondary' },
  draft: { label: 'Awaiting approval', variant: 'lime' },
  scheduled: { label: 'Scheduled', variant: 'ok' },
  sending: { label: 'Sending', variant: 'secondary' },
  published: { label: 'Published', variant: 'ok' },
  send_failed: { label: 'Send failed', variant: 'danger' },
  skipped: { label: 'Skipped', variant: 'secondary' },
};

function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

function dateTimeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

function title(update: PatronUpdate): string {
  switch (update.status) {
    case 'queued':
    case 'drafting':
      return 'Drafting your next update';
    case 'published':
      return 'Published';
    case 'scheduled':
      return 'Scheduled';
    case 'skipped':
      return 'Skipped · the agent will try again after your next note';
    case 'send_failed':
      return 'Send failed';
    default:
      return update.draftFailed ? 'Write it yourself' : 'Draft';
  }
}

export interface EditorCardProps {
  update: PatronUpdate;
  timezone: string;
  subject: string;
  body: string;
  saving: boolean;
  busy: string | null;
  recipientCount: number;
  sendTime: SendTimeOption;
  teaser: boolean;
  onSubject(value: string): void;
  onBody(value: string): void;
  onSwapSubject(alt: string): void;
  onRewrite(variant: RewriteVariant | 'restore'): void;
  onPublish(): Promise<void>;
  onPreview(): void;
  onSkip(reason: string): Promise<void>;
  onUndoSkip(): void;
  onCancelSchedule(): void;
  onRemoveTeaser(): void;
  onRebuild(): void;
  /** Queued only: skip the rest of the window and draft now. */
  onDraftNow(): void;
}

export function EditorCard(props: EditorCardProps) {
  const { update, timezone } = props;
  const [mode, setMode] = useState<'idle' | 'confirm' | 'skip'>('idle');
  const [reason, setReason] = useState('');
  const editable = update.status === 'draft' || update.status === 'send_failed';
  const badge = STATUS_BADGE[update.status] ?? STATUS_BADGE.draft!;
  const hasText = props.body.trim().length > 0 && props.subject.trim().length > 0;
  const approveDisabled =
    props.recipientCount === 0 || !hasText || props.busy !== null || props.saving;

  const provenance =
    update.status === 'queued' && update.dueAt
      ? `The agent drafts this at ${timeOf(update.dueAt, timezone)}. Nothing goes out until you approve it.`
      : update.status === 'drafting'
        ? 'The agent is drafting from your note now.'
        : update.draftFailed
          ? "The agent couldn't draft this one. Your note and result are attached below."
          : update.status === 'published' && update.sentAt
            ? `Sent ${dateTimeOf(update.sentAt, timezone)}. Sent emails can't be changed.`
            : update.draftedAt
              ? `Drafting model · drafted ${timeOf(update.draftedAt, timezone)}.${editable ? ' Edit anything.' : ''}`
              : editable
                ? 'Edit anything.'
                : '';

  let footer: React.ReactNode;
  if (update.status === 'queued') {
    footer = (
      <Button variant="outline" onClick={props.onDraftNow} disabled={props.busy !== null}>
        {props.busy === 'new' ? <Spinner /> : null}
        Draft it now
      </Button>
    );
  } else if (update.status === 'drafting' || update.status === 'sending') {
    footer = (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> {update.status === 'sending' ? 'Sending…' : 'Drafting…'}
      </span>
    );
  } else if (update.status === 'published') {
    const shown = update.teaser && !update.teaserRemovedAt;
    footer = (
      <>
        <Badge variant="ok">
          <BadgeDot />
          Sent to {patrons(update.deliveredCount ?? 0)} via Resend
        </Badge>
        {shown ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onRemoveTeaser}
            disabled={props.busy !== null}
          >
            Remove teaser from profile
          </Button>
        ) : null}
        <Link href="/fans" className={buttonVariants({ variant: 'outline', className: 'ml-auto' })}>
          Watch it land in Fans
        </Link>
      </>
    );
  } else if (update.status === 'scheduled') {
    footer = (
      <>
        <Badge variant="ok">
          <BadgeDot />
          Scheduled · {update.sendAt ? dateTimeOf(update.sendAt, timezone) : ''}
        </Badge>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={props.onCancelSchedule}
          disabled={props.busy !== null}
        >
          Cancel
        </Button>
      </>
    );
  } else if (update.status === 'skipped') {
    footer = (
      <>
        <span className="text-sm text-muted-foreground">Skipped. Nothing was sent.</span>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={props.onUndoSkip}
          disabled={props.busy !== null}
        >
          Undo
        </Button>
      </>
    );
  } else if (mode === 'confirm') {
    const scheduled = props.sendTime.kind !== 'now';
    footer = (
      <Confirm
        className="w-full"
        title={confirmTitle(props.recipientCount, props.sendTime)}
        description={confirmDetail(props.teaser, scheduled)}
        actions={
          <>
            <Button
              disabled={props.busy !== null}
              onClick={async () => {
                await props.onPublish();
                setMode('idle');
              }}
            >
              {props.busy === 'publish' ? <Spinner /> : null}
              {scheduled ? 'Schedule' : 'Send'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setMode('idle')}
              disabled={props.busy !== null}
            >
              Back
            </Button>
          </>
        }
      />
    );
  } else if (mode === 'skip') {
    footer = (
      <div className="grid w-full gap-2">
        <Confirm
          title="Skip this update"
          description="Nothing is sent. The agent tries again after your next note. Say why, so the history remembers."
          actions={
            <>
              <Button
                disabled={!reason.trim() || props.busy !== null}
                onClick={async () => {
                  await props.onSkip(reason);
                  setMode('idle');
                  setReason('');
                }}
              >
                Skip the update
              </Button>
              <Button variant="outline" onClick={() => setMode('idle')}>
                Cancel
              </Button>
            </>
          }
        />
        <div className="flex flex-wrap gap-2">
          {SKIP_REASONS.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={reason === r ? 'secondary' : 'outline'}
              onClick={() => setReason(r)}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </Button>
          ))}
        </div>
        <Input
          value={SKIP_REASONS.includes(reason as (typeof SKIP_REASONS)[number]) ? '' : reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Or in your own words"
          aria-label="Reason for skipping"
        />
      </div>
    );
  } else {
    footer = (
      <>
        {update.status === 'send_failed' ? (
          <p className="w-full text-sm text-danger">
            Nothing reached patrons. Try again or download the text.
          </p>
        ) : null}
        <Button onClick={() => setMode('confirm')} disabled={approveDisabled}>
          {update.status === 'send_failed' ? 'Try again' : 'Approve & publish'}
        </Button>
        <Button
          variant="outline"
          onClick={props.onPreview}
          disabled={!hasText || props.busy !== null}
        >
          Preview email
        </Button>
        {update.status === 'send_failed' ? (
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              const blob = new Blob([`${props.subject}\n\n${props.body}`], { type: 'text/plain' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'patron-update.txt';
              a.click();
            }}
          >
            Download the text
          </Button>
        ) : (
          <Button variant="ghost" className="ml-auto" onClick={() => setMode('skip')}>
            Skip this draft
          </Button>
        )}
      </>
    );
  }

  if (update.status === 'queued' || update.status === 'drafting') {
    return (
      <Card className="gap-4 p-6" id="caEditor">
        <CardHeader className="p-0">
          <CardTitle>{title(update)}</CardTitle>
          <CardDescription>{provenance}</CardDescription>
          <CardActions>
            <Badge variant={badge.variant}>
              <BadgeDot />
              {badge.label}
            </Badge>
          </CardActions>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2" id="caFoot">
          {footer}
        </div>
      </Card>
    );
  }

  return (
    <Card className="gap-5 p-6" id="caEditor">
      <CardHeader className="p-0">
        <CardTitle>{title(update)}</CardTitle>
        <CardDescription>{provenance}</CardDescription>
        <CardActions>
          <Badge variant={badge.variant}>
            <BadgeDot />
            {badge.label}
          </Badge>
        </CardActions>
      </CardHeader>

      {update.rebuildNoteId && update.status === 'draft' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 text-sm shadow-[0_0_0_1px_var(--border)]">
          <span>A newer match note arrived after this draft.</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={props.onRebuild}
            disabled={props.busy !== null}
          >
            Rebuild from the new note
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="caSubj">
          Subject
        </label>
        <Input
          id="caSubj"
          value={props.subject}
          onChange={(e) => props.onSubject(e.target.value)}
          disabled={!editable}
          className="h-10 text-[0.9375rem]"
        />
        {editable && update.altSubjects.length ? (
          <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
            <span>Or:</span>
            {update.altSubjects.map((alt) => (
              <button
                key={alt}
                type="button"
                className="min-h-8 rounded-sm px-2 underline decoration-dotted underline-offset-4 hover:text-foreground"
                onClick={() => props.onSwapSubject(alt)}
              >
                {alt}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.8125rem] text-muted-foreground">Ask the agent to make it</span>
            {(['shorter', 'warmer', 'tactical'] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant="outline"
                disabled={props.busy !== null || !props.body.trim()}
                onClick={() => props.onRewrite(v)}
              >
                {props.busy === v ? <Spinner /> : null}
                {v === 'tactical' ? 'More tactical' : v.charAt(0).toUpperCase() + v.slice(1)}
              </Button>
            ))}
            {update.generatedBody !== null ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                disabled={props.busy !== null}
                onClick={() => props.onRewrite('restore')}
              >
                Restore original
              </Button>
            ) : null}
          </div>
        ) : null}
        <Textarea
          id="caBody"
          aria-label="Update body"
          value={props.body}
          onChange={(e) => props.onBody(e.target.value)}
          disabled={!editable}
          rows={14}
          placeholder={update.draftFailed ? 'Write your update here.' : undefined}
          className="min-h-[18rem] text-[0.9375rem] leading-relaxed"
        />
        <div className="flex justify-between text-[0.8125rem] text-muted-foreground">
          <span id="caCount">
            {props.body.trim() ? countLine(props.body) : 'Nothing written yet'}
          </span>
          {editable ? (
            <span>{props.saving ? 'Saving…' : 'Autosaved · edits stay if you leave'}</span>
          ) : null}
        </div>
      </div>

      {update.practiceSection ? (
        <div className="grid gap-1">
          <div className="text-sm font-medium">
            Practice notes{' '}
            <span className="font-normal text-muted-foreground">· Locker Room and above</span>
          </div>
          <p className="text-sm text-muted-foreground">{update.practiceSection}</p>
        </div>
      ) : null}

      {update.builtFrom.length ? (
        <div className="grid gap-2">
          <div className="text-sm font-medium">
            Built from{' '}
            <span className="font-normal text-muted-foreground">
              · what the agent read before writing
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {update.builtFrom.map((b) =>
              b.kind === 'note' ? (
                <Link
                  key={b.label}
                  href="/match-scribe"
                  className="rounded-full bg-surface px-3 py-1 text-[0.8125rem] shadow-[0_0_0_1px_var(--border)] hover:bg-accent"
                >
                  {b.label}
                </Link>
              ) : (
                <span
                  key={b.label}
                  className="rounded-full bg-surface px-3 py-1 text-[0.8125rem] shadow-[0_0_0_1px_var(--border)]"
                >
                  {b.label}
                </span>
              ),
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4" id="caFoot">
        {footer}
      </div>
    </Card>
  );
}
