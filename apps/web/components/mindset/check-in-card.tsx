'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardActions,
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
import { listCheckIns, saveCheckIn, type SaveCheckInInput } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { MealOutcomeLine } from '@/components/fuel/meal-outcome-line';

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
  // en-CA formats as YYYY-MM-DD, the player's local calendar date.
  const localDate = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()),
    [timezone],
  );
  const [value, setValue] = useState<(typeof VALUES)[number] | null>(null);
  const [sentence, setSentence] = useState('');
  // What is stored for today, so the card shows it and Save only lights up on a change.
  const [saved, setSaved] = useState<{ value: number; sentence: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Today's check-in may already exist from the dashboard or another page (one
  // per day, MC-5). Load it, so the card doesn't look empty and a save from here
  // keeps the sentence written elsewhere instead of wiping it.
  useEffect(() => {
    let cancelled = false;
    void listCheckIns(supabase, 1)
      .then((rows) => {
        const today = rows.find((r) => r.date === localDate);
        if (cancelled || !today) return;
        setValue(today.value as (typeof VALUES)[number]);
        setSentence(today.sentence ?? '');
        setSaved({ value: today.value, sentence: today.sentence ?? '' });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [supabase, localDate]);

  const changed = !saved || saved.value !== value || saved.sentence !== sentence.trim();

  const handleSave = async () => {
    if (!value) return;
    setSaving(true);
    try {
      await saveCheckIn(supabase, {
        playerId,
        date: localDate,
        value,
        sentence: sentence.trim() || null,
        source,
      });
      setSaved({ value, sentence: sentence.trim() });
      onToast?.(`Check-in saved · ${value}/5`);
      onSaved?.();
    } catch {
      onToast?.("Couldn't save the check-in. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {saved && (
          <CardActions>
            <Badge variant="ok" className="tabular-nums">
              Today · {saved.value}/5
            </Badge>
          </CardActions>
        )}
      </CardHeader>
      <div className="flex flex-col gap-4 px-6">
        {/* PRD-07: Fuel's next-day question rides in the Match Scribe and
            Mindset check-ins only, not the dashboard's. */}
        {source !== 'dashboard' && (
          <MealOutcomeLine playerId={playerId} timezone={timezone} onToast={onToast} />
        )}
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
              <ToggleGroupItem key={n} value={String(n)} className="min-w-11 justify-center">
                {n}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Input
          placeholder="One sentence, optional"
          aria-label="One sentence"
          value={sentence}
          maxLength={280}
          onChange={(e) => setSentence(e.target.value)}
        />
      </div>
      <CardFooter>
        <Button
          variant="outline"
          className="w-full"
          disabled={!value || saving || !changed}
          onClick={handleSave}
        >
          {saving
            ? 'Saving…'
            : saved && !changed
              ? 'Saved for today'
              : saved
                ? 'Update'
                : 'Save check-in'}
        </Button>
      </CardFooter>
    </Card>
  );
}
