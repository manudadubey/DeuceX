'use client';

import { Check, CircleAlert } from 'lucide-react';
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
  Checkbox,
  FieldLabel,
} from '@deucex/ui';
import {
  recipientLine,
  type SendTimeOption,
  type UpdateCheck,
  type CheckKind,
} from '@deucex/agents';
import type { ContentTier } from '@/lib/content/api';

// PRD-05 section 4.1's right-hand column: "Who receives it" (C-8, C-12, C-13)
// and "Before it goes out" (C-10).

export function RecipientsCard({
  tiers,
  selected,
  reasons,
  sendTimes,
  sendKind,
  teaser,
  disabled,
  onToggleTier,
  onSendTime,
  onTeaser,
}: {
  tiers: ContentTier[];
  selected: string[];
  reasons: Record<string, string>;
  sendTimes: SendTimeOption[];
  sendKind: SendTimeOption['kind'];
  teaser: boolean;
  disabled: boolean;
  onToggleTier(id: string): void;
  onSendTime(kind: SendTimeOption['kind']): void;
  onTeaser(on: boolean): void;
}) {
  return (
    <Card className="gap-4 p-6">
      <CardHeader className="p-0">
        <CardTitle>Who receives it</CardTitle>
        <CardDescription id="caRecipD">
          {tiers.length === 0
            ? 'No patron tiers yet. Publish a tier in Fans first.'
            : recipientLine(tiers, selected)}
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-2" role="group" aria-label="Tiers">
        {tiers.map((t) => {
          const on = selected.includes(t.id);
          return (
            <label
              key={t.id}
              className={cn(
                'grid min-h-11 cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-lg px-3 py-2 text-left',
                'shadow-[0_0_0_1px_var(--border)] hover:bg-accent has-[:disabled]:cursor-default has-[:disabled]:opacity-60',
              )}
            >
              <Checkbox
                className="row-span-2"
                checked={on}
                disabled={disabled}
                onCheckedChange={() => onToggleTier(t.id)}
              />
              <span className="text-sm font-medium">{t.name}</span>
              <span className="row-span-2 font-mono text-sm tabular-nums">{t.activeCount}</span>
              <span className="text-[0.8125rem] text-muted-foreground">
                {reasons[t.id] ?? `${t.activeCount} ${t.activeCount === 1 ? 'person' : 'people'}`}
              </span>
            </label>
          );
        })}
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="caWhen">When</FieldLabel>
        <Select
          value={sendKind}
          onValueChange={(v) => onSendTime(v as SendTimeOption['kind'])}
          disabled={disabled}
        >
          <SelectTrigger id="caWhen" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sendTimes.map((o) => (
              <SelectItem key={o.kind} value={o.kind}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Switch checked={teaser} onCheckedChange={onTeaser} disabled={disabled} id="teaserSw" />
        Post the first paragraph on your public profile
      </label>
    </Card>
  );
}

export function ChecksCard({
  checks,
  disabled,
  busyKind,
  onFix,
}: {
  checks: UpdateCheck[];
  disabled: boolean;
  busyKind: CheckKind | null;
  onFix(kind: CheckKind): void;
}) {
  return (
    <Card className="gap-4 p-6">
      <CardHeader className="p-0">
        <CardTitle>Before it goes out</CardTitle>
        <CardDescription>
          The agent&apos;s own read of the draft. A warning never stops you publishing.
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3">
        {checks.map((c) => (
          <div
            key={c.kind}
            className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-0.5"
          >
            <span
              className={cn(
                'row-span-2 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full',
                c.state === 'pass' ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn',
              )}
            >
              {c.state === 'pass' ? (
                <Check className="h-3 w-3" aria-hidden />
              ) : (
                <CircleAlert className="h-3 w-3" aria-hidden />
              )}
            </span>
            <span className="text-sm font-medium">{c.title}</span>
            {c.state === 'warn' && c.fixable ? (
              <Button
                size="sm"
                variant="outline"
                className="row-span-2"
                disabled={disabled || busyKind !== null}
                onClick={() => onFix(c.kind)}
              >
                Fix
              </Button>
            ) : (
              <span className="row-span-2" />
            )}
            <span className="text-[0.8125rem] text-muted-foreground">{c.reason}</span>
          </div>
        ))}
        {checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">The checks run once there is some text.</p>
        ) : null}
      </div>
    </Card>
  );
}
