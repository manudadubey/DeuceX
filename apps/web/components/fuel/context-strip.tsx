'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarDays, Clock, Layers, Wallet } from 'lucide-react';
import {
  Button,
  Field,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@deucex/ui';
import { PRE_MATCH_WINDOW_HOURS } from '@deucex/agents';
import { formatHome } from '@/lib/fuel/format';

const chip =
  'inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[0.8125rem] max-[900px]:min-h-11';

function Chip({
  icon,
  tip,
  children,
  className,
}: {
  icon: React.ReactNode;
  tip?: string;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  const body = (
    <span className={cn(chip, className)} tabIndex={tip ? 0 : undefined}>
      {icon}
      {children}
    </span>
  );
  if (!tip) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

// "Match tomorrow 10:00 · Q1 vs Petrov", in the player's own time zone.
export function matchChipText(at: Date, label: string | null, timezone: string, now = new Date()) {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
  const tomorrow = new Date(now.getTime() + 24 * 3_600_000);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  const when =
    day(at) === day(now)
      ? 'today'
      : day(at) === day(tomorrow)
        ? 'tomorrow'
        : new Intl.DateTimeFormat('en-AU', {
            timeZone: timezone,
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }).format(at);
  return `Match ${when} ${time}${label ? ` · ${label}` : ''}`;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ContextStrip({
  nowText,
  city,
  timezone,
  nextMatchAt,
  nextMatchLabel,
  dietaryText,
  foodMoneyLeft,
  foodMoneyStale,
  homeCurrency,
  onSaveNextMatch,
  locked = false,
}: {
  nowText: string;
  city: string | null;
  timezone: string;
  nextMatchAt: string | null;
  nextMatchLabel: string | null;
  dietaryText: string;
  foodMoneyLeft: number | null;
  foodMoneyStale: boolean;
  homeCurrency: string;
  onSaveNextMatch: (next: { at: string; label: string | null } | null) => Promise<void>;
  locked?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [at, setAt] = useState(toLocalInput(nextMatchAt));
  const [label, setLabel] = useState(nextMatchLabel ?? '');
  const [saving, setSaving] = useState(false);

  const upcoming = nextMatchAt && new Date(nextMatchAt) > new Date() ? new Date(nextMatchAt) : null;

  const save = async (clear = false) => {
    setSaving(true);
    try {
      await onSaveNextMatch(
        clear || !at ? null : { at: new Date(at).toISOString(), label: label.trim() || null },
      );
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const icon = 'size-3.5 text-muted-foreground';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Chip icon={<Clock aria-hidden="true" className={icon} />}>
          Now {nowText}
          {city ? ` · ${city}` : ''}
        </Chip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={locked}
              onClick={() => setEditing((e) => !e)}
              className={cn(chip, 'hover:bg-accent disabled:pointer-events-none')}
              aria-expanded={editing}
            >
              <CalendarDays aria-hidden="true" className={icon} />
              {upcoming ? matchChipText(upcoming, nextMatchLabel, timezone) : 'Next match not set'}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {`Set by you. Picks lean light and carbohydrate-forward when a match is under ${PRE_MATCH_WINDOW_HOURS} hours away.`}
          </TooltipContent>
        </Tooltip>

        <Chip
          icon={<Layers aria-hidden="true" className={icon} />}
          tip="From your Fuel preferences. Treated as hard rules, not suggestions."
        >
          {dietaryText}
        </Chip>

        {foodMoneyLeft === null ? (
          <Link href="/agent/financial" className={cn(chip, 'hover:bg-accent')}>
            <Wallet aria-hidden="true" className={icon} />
            Set a daily food amount
          </Link>
        ) : (
          <Chip
            icon={<Wallet aria-hidden="true" className={icon} />}
            tip="Your daily food money from the Financial Agent, less today's Food lines."
            className={foodMoneyLeft < 0 ? 'text-warn' : undefined}
          >
            {foodMoneyLeft >= 0
              ? `${formatHome(foodMoneyLeft, homeCurrency)} left for food today`
              : `${formatHome(-foodMoneyLeft, homeCurrency)} over today's food money`}
            {foodMoneyStale ? ' · not refreshed' : ''}
          </Chip>
        )}
      </div>

      {editing && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
          <Field className="min-w-[12rem]">
            <FieldLabel htmlFor="fuel-next-at">Next match starts</FieldLabel>
            <Input
              id="fuel-next-at"
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </Field>
          <Field className="min-w-[12rem] flex-1">
            <FieldLabel htmlFor="fuel-next-label">Round and opponent (optional)</FieldLabel>
            <Input
              id="fuel-next-label"
              maxLength={80}
              placeholder="Q1 vs Petrov"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving || !at}>
              Save
            </Button>
            {upcoming && (
              <Button size="sm" variant="outline" onClick={() => void save(true)} disabled={saving}>
                Clear
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
