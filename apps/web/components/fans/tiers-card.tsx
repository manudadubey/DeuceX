'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Confirm,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Textarea,
} from '@deucex/ui';
import { formatPatronMoney } from '@deucex/agents';
import { createClient } from '@/lib/supabase/client';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import { publishTier } from '@/lib/fans/api';
import { TIER_COLOURS, type FansTierView } from '@/lib/fans/load';

// P-1: three tiers with editable names, monthly prices and perk sentences,
// defaulting to Courtside A$29, Locker Room A$65 and Inside Track A$185, in
// the home currency. Each save is one tier_change approval with a consequence
// sentence stating how many patrons are affected and when (PRD-04 section 3).
// Grandfathered (owner decision, step 4.1): a new price applies to new
// sign-ups only, so the sentence says existing patrons keep theirs.

export const DEFAULT_TIERS = [
  {
    position: 1,
    name: 'Courtside',
    price: 29,
    perks: 'Every update, match results the same night, a name on your profile page.',
  },
  {
    position: 2,
    name: 'Locker Room',
    price: 65,
    perks: 'Courtside plus practice notes, the tournament shortlist each week, and a monthly Q&A.',
  },
  {
    position: 3,
    name: 'Inside Track',
    price: 185,
    perks: 'Everything, a call after each tournament, and a seat at one event a season.',
  },
] as const;

interface Draft {
  position: number;
  name: string;
  price: string;
  perks: string;
}

function consequence(existing: FansTierView | undefined, draft: Draft, currency: string): string {
  const price = Number(draft.price);
  if (!existing || !existing.published) {
    return `Publishes ${draft.name.trim()} at ${formatPatronMoney(price, currency, price % 1 ? 2 : 0)} a month on your patron page now. New patrons can sign up to it straight away; you can edit it later.`;
  }
  const n = existing.activeCount;
  const who = n === 1 ? '1 patron' : `${n} patrons`;
  const parts: string[] = [];
  if (price !== existing.price) {
    parts.push(
      `New sign-ups pay ${formatPatronMoney(price, currency, price % 1 ? 2 : 0)} from now. The ${who} already on ${existing.name} keep paying ${formatPatronMoney(existing.price, currency)}.`,
    );
  }
  if (draft.name.trim() !== existing.name || draft.perks.trim() !== existing.perks) {
    parts.push(
      `The new name and perks show to all ${who} on this tier and on your page straight away.`,
    );
  }
  return parts.length
    ? `${parts.join(' ')} You can change it again later.`
    : 'Nothing has changed.';
}

function TierEditor({
  playerId,
  tier,
  defaults,
  currency,
  onDone,
  onToast,
}: {
  playerId: string;
  tier: FansTierView | undefined;
  defaults: Draft;
  currency: string;
  onDone: () => void;
  onToast: (title: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<Draft>(
    tier
      ? { position: tier.position, name: tier.name, price: String(tier.price), perks: tier.perks }
      : defaults,
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = Number(draft.price);
  const valid =
    draft.name.trim().length > 0 &&
    draft.name.trim().length <= 40 &&
    price >= 1 &&
    price <= 10000 &&
    Math.round(price * 100) === price * 100 &&
    draft.perks.length <= 280;
  const unchanged =
    tier?.published &&
    tier.name === draft.name.trim() &&
    tier.price === price &&
    tier.perks === draft.perks.trim();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        position: draft.position,
        name: draft.name.trim(),
        price,
        perks: draft.perks.trim(),
      };
      const approval = await confirmApproval({ playerId, actionType: 'tier_change', payload });
      await publishTier(supabase, { approvalId: approval.id, ...payload });
      onToast(tier?.published ? `${payload.name} updated` : `${payload.name} is live on your page`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The tier was not saved.');
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 border-t border-border px-5 py-4 max-sm:px-4">
      <div className="grid grid-cols-[1fr_8rem] gap-3 max-sm:grid-cols-1">
        <Field>
          <FieldLabel htmlFor={`tier-name-${draft.position}`}>Name</FieldLabel>
          <Input
            id={`tier-name-${draft.position}`}
            value={draft.name}
            maxLength={40}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`tier-price-${draft.position}`}>Monthly, {currency}</FieldLabel>
          <Input
            id={`tier-price-${draft.position}`}
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^0-9.]/g, '') })}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`tier-perks-${draft.position}`}>What they get</FieldLabel>
        <Textarea
          id={`tier-perks-${draft.position}`}
          rows={2}
          maxLength={280}
          value={draft.perks}
          onChange={(e) => setDraft({ ...draft, perks: e.target.value })}
        />
        <FieldDescription>
          One sentence. Patrons see it on your page before they choose.
        </FieldDescription>
      </Field>
      {confirming && valid && !unchanged ? (
        <Confirm
          title={tier?.published ? `Save ${draft.name.trim()}` : `Publish ${draft.name.trim()}`}
          description={consequence(tier, draft, currency)}
          actions={
            <>
              <Button size="sm" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Confirm'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </>
          }
        />
      ) : (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid || Boolean(unchanged)}
            onClick={() => setConfirming(true)}
          >
            {tier?.published ? 'Save changes' : 'Publish tier'}
          </Button>
        </div>
      )}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function TiersCard({
  playerId,
  tiers,
  currency,
  locked,
  canEdit,
  onChanged,
  onToast,
}: {
  playerId: string;
  tiers: FansTierView[];
  currency: string;
  locked?: boolean;
  /** False until Stripe onboarding has created the player's account. */
  canEdit: boolean;
  onChanged: () => void;
  onToast: (title: string) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const total = Math.max(
    1,
    tiers.reduce((sum, t) => sum + t.activeCount, 0),
  );
  const rows = DEFAULT_TIERS.map((d, i) => ({
    defaults: { position: d.position, name: d.name, price: String(d.price), perks: d.perks },
    tier: tiers.find((t) => t.position === d.position),
    colour: TIER_COLOURS[i]!,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tiers</CardTitle>
        <CardDescription>What each group gets, and who&apos;s in it.</CardDescription>
        {!locked && canEdit && editing === null ? (
          <CardActions>
            <Button size="sm" variant="outline" onClick={() => setEditing(1)}>
              Edit tiers
            </Button>
          </CardActions>
        ) : null}
      </CardHeader>
      <div className="grid">
        {rows.map(({ defaults, tier, colour }) => {
          const shown = tier ?? {
            ...defaults,
            price: Number(defaults.price),
            activeCount: 0,
            published: false,
          };
          return (
            <div key={defaults.position}>
              <button
                type="button"
                disabled={locked || !canEdit}
                onClick={() => setEditing(editing === defaults.position ? null : defaults.position)}
                className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border px-5 py-3 text-left disabled:cursor-default max-sm:px-4"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <i className="block size-2 rounded-full" style={{ background: colour }} />
                  {shown.name}
                  {!shown.published ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      · not published
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-sm">
                  {formatPatronMoney(
                    shown.price,
                    tier?.currency ?? currency,
                    shown.price % 1 ? 2 : 0,
                  )}
                  /mo · {shown.activeCount === 1 ? '1 person' : `${shown.activeCount} people`}
                </span>
                <span className="col-span-2 text-xs text-muted-foreground">{shown.perks}</span>
                <span className="col-span-2 mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <i
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.round((shown.activeCount / total) * 100)}%`,
                      background: colour,
                    }}
                  />
                </span>
              </button>
              {editing === defaults.position && !locked ? (
                <TierEditor
                  playerId={playerId}
                  tier={tier}
                  defaults={defaults}
                  currency={tier?.currency ?? currency}
                  onToast={onToast}
                  onDone={() => {
                    setEditing(null);
                    onChanged();
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mx-5 mb-5 mt-2 rounded-lg bg-surface p-3.5 text-sm max-sm:mx-4">
        <div className="font-medium">
          Publishing keeps people{' '}
          <small className="font-normal text-muted-foreground">
            · the loop the Content Agent feeds
          </small>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Each update you publish will show here with its open rate and the joins in the seven days
          after it. Updates arrive with the Content Agent.
        </p>
      </div>
    </Card>
  );
}
