'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
} from '@procircuit/ui';
import { updateAccount, type Player } from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';
import { PasskeyRegister } from '../passkey-register';

const COMMON_TIMEZONES = [
  'Europe/Vienna',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/London',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Asia/Shanghai',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

// PRD-12 §4.2: name, read-only email, passkey, time zone — the note tying
// time zone to the Mindset Coach's daily run time is load-bearing (it's the
// only place a player learns why this field matters). One Save button.
export function AccountPane({
  player,
  onPlayerChange,
  onToast,
}: {
  player: Player;
  onPlayerChange: (patch: Partial<Player>) => void;
  onToast: (title: string) => void;
}) {
  const [name, setName] = useState(player.name);
  const [timezone, setTimezone] = useState(player.timezone);
  const [saving, setSaving] = useState(false);

  const timezoneOptions = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      await updateAccount(supabase, { playerId: player.id, name, timezone });
      onPlayerChange({ name, timezone });
      onToast('Saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="acc-name">Name</FieldLabel>
          <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field>
          <FieldLabel>Email</FieldLabel>
          <Input value={player.email} disabled readOnly />
          <FieldDescription>Verified · used for sign-in and agent emails</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="acc-passkey">Sign-in</FieldLabel>
          <PasskeyRegister />
        </Field>

        <Field>
          <FieldLabel htmlFor="acc-tz">Time zone</FieldLabel>
          <select
            id="acc-tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
            >
              Follow my phone
            </Button>
          </div>
          <FieldDescription>Mindset Coach runs at 06:00 in this zone.</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="border-t border-border pt-6">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          Save
        </Button>
      </div>
    </Card>
  );
}
