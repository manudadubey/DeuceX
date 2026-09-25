'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from '@deucex/ui';
import { saveCheckIn, type SaveCheckInInput } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';

const VALUES = [1, 2, 3, 4, 5] as const;

// MC-5: "saved from the Mindset page, the dashboard or Match Scribe" — one
// component, three call sites (source distinguishes them in check_ins.source).
export function CheckInCard({
  playerId,
  timezone,
  source,
  title = 'Check in',
  description = "Thirty seconds. It's the second thing the coach reads, after your notes.",
  onToast,
  onSaved,
}: {
  playerId: string;
  timezone: string;
  source: SaveCheckInInput['source'];
  title?: string;
  description?: string;
  /** Optional so a Server Component (dashboard page.tsx) can render this without passing a function across the RSC boundary. */
  onToast?: (title: string) => void;
  onSaved?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [value, setValue] = useState<(typeof VALUES)[number] | null>(null);
  const [sentence, setSentence] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value) return;
    setSaving(true);
    try {
      // en-CA formats as YYYY-MM-DD, the player's local calendar date.
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
      await saveCheckIn(supabase, {
        playerId,
        date: localDate,
        value,
        sentence: sentence || null,
        source,
      });
      onToast?.(`Check-in saved · ${value}/5`);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-4 px-6">
        <Field>
          <FieldLabel>
            This morning <small>· 1 flat, 5 energised</small>
          </FieldLabel>
          <ToggleGroup
            type="single"
            value={value ? String(value) : ''}
            onValueChange={(v) => v && setValue(Number(v) as (typeof VALUES)[number])}
            aria-label="This morning's mood"
          >
            {VALUES.map((n) => (
              <ToggleGroupItem key={n} value={String(n)}>
                {n}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Input
          placeholder="One sentence, optional"
          aria-label="One sentence"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
        />
      </div>
      <CardFooter>
        <Button
          variant="outline"
          className="w-full"
          disabled={!value || saving}
          onClick={handleSave}
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
