'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deucex/ui';
import { fullName, updateAccount, type Player } from '@deucex/db';
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

// Picking this item sets the zone to whatever this device reports.
const FOLLOW_DEVICE = '__device__';

// PRD-12 §4.2: name, read-only email, passkey, time zone — the note tying
// time zone to the morning run is load-bearing (it's the only place a player
// learns why this field matters). One Save button. Laid out as the
// prototype's #/settings Account card: a two-column field grid (20px rows,
// 16px columns, one column on phones), "Follow my phone" as an option in the
// time zone list, Save in the card footer.
export function AccountPane({
  player,
  onPlayerChange,
  onToast,
}: {
  player: Player;
  onPlayerChange: (patch: Partial<Player>) => void;
  onToast: (title: string) => void;
}) {
  const [firstName, setFirstName] = useState(player.first_name ?? player.name.split(' ')[0] ?? '');
  const [lastName, setLastName] = useState(
    player.last_name ?? player.name.split(' ').slice(1).join(' '),
  );
  const [timezone, setTimezone] = useState(player.timezone);
  const [saving, setSaving] = useState(false);
  // Read after mount: the server render can't know the device's zone.
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  useEffect(() => setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  // The device's zone is offered once, as "Follow my phone"; choosing it
  // makes it the current zone, which is always listed.
  const timezoneOptions = [...new Set([timezone, ...COMMON_TIMEZONES])];

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      await updateAccount(supabase, { playerId: player.id, firstName, lastName, timezone });
      onPlayerChange({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        name: fullName(firstName, lastName),
        timezone,
      });
      onToast('Saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          Sign-in and who you are. Playing details live on your public profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 max-sm:grid-cols-1">
        <Field>
          <FieldLabel htmlFor="acc-first-name">First name</FieldLabel>
          <Input
            id="acc-first-name"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="acc-last-name">Last name</FieldLabel>
          <Input
            id="acc-last-name"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </Field>

        <Field className="col-span-full">
          <FieldLabel htmlFor="acc-email">Email</FieldLabel>
          <Input id="acc-email" value={player.email} disabled readOnly />
          <FieldDescription>Verified · used for sign-in and agent emails</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Sign-in</FieldLabel>
          <PasskeyRegister />
          <FieldDescription>
            Sign in with Face ID, Touch ID or a security key instead of an email link.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="acc-tz">Time zone</FieldLabel>
          <Select
            value={timezone}
            onValueChange={(v) => setTimezone(v === FOLLOW_DEVICE && deviceZone ? deviceZone : v)}
          >
            <SelectTrigger id="acc-tz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {deviceZone ? (
                <SelectItem value={FOLLOW_DEVICE}>Follow my phone ({deviceZone})</SelectItem>
              ) : null}
              {timezoneOptions.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Your morning run (Mindset Coach and Financial Agent) is at 07:00 in this zone.
          </FieldDescription>
        </Field>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={saving || !firstName.trim() || !lastName.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </CardFooter>
    </Card>
  );
}
