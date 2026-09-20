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
} from '@procircuit/ui';
import { saveCheckIn } from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';

const VALUES = [1, 2, 3, 4, 5] as const;

// `#dailyMood` (PRD-02 section 4.4): the same 1-5 check-in also appears on
// the dashboard and `#/agent/mindset` (PRD-06 owns those two); this is the
// Match Scribe copy.
export function DailyCheckInCard({
  playerId,
  timezone,
  onToast,
}: {
  playerId: string;
  timezone: string;
  onToast: (title: string) => void;
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
        source: 'scribe',
      });
      onToast(`Check-in saved · ${value}/5`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily check-in</CardTitle>
        <CardDescription>
          Thirty seconds when there&apos;s nothing to record. Feeds the Mindset Coach&apos;s pattern
          detection.
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-4 px-6">
        <Field>
          <FieldLabel>
            Today <small>· 1 flat, 5 energised</small>
          </FieldLabel>
          <ToggleGroup
            type="single"
            value={value ? String(value) : ''}
            onValueChange={(v) => v && setValue(Number(v) as (typeof VALUES)[number])}
            aria-label="Today's mood"
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
          Save check-in
        </Button>
      </CardFooter>
    </Card>
  );
}
