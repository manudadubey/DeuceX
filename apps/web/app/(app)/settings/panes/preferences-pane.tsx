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
  ToggleGroup,
  ToggleGroupItem,
} from '@procircuit/ui';
import {
  updatePreferences,
  type AppLanguage,
  type DateFormat,
  type HomeCurrency,
  type Player,
  type SpokenLanguage,
  type Units,
} from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'DMY', label: '12 Sep 2026 · 1,234.50' },
  { value: 'MDY', label: '09/12/2026 · 1,234.50' },
  { value: 'ISO', label: '2026-09-12 · 1 234,50' },
];

// PRD-12 §4.3, ST-3 to ST-6. Patron-update language is single-select
// (decisions worksheet 9: "the multi-select becomes single-select for
// Release 1"), matching players.patron_language's existing schema, not the
// PRD prose's multi-select — see the step 2.3 migration's design notes.
export function PreferencesPane({
  player,
  onPlayerChange,
  onToast,
}: {
  player: Player;
  onPlayerChange: (patch: Partial<Player>) => void;
  onToast: (title: string) => void;
}) {
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(player.app_language as AppLanguage);
  const [homeCurrency, setHomeCurrency] = useState<HomeCurrency>(
    player.home_currency as HomeCurrency,
  );
  const [spokenLanguage, setSpokenLanguage] = useState<SpokenLanguage>(
    player.spoken_language as SpokenLanguage,
  );
  const [patronLanguage, setPatronLanguage] = useState<string | null>(player.patron_language);
  const [units, setUnits] = useState<Units>(player.units as Units);
  const [dateFormat, setDateFormat] = useState<DateFormat>(player.date_format as DateFormat);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      await updatePreferences(supabase, {
        playerId: player.id,
        appLanguage,
        homeCurrency,
        spokenLanguage,
        patronLanguage,
        units,
        dateFormat,
      });
      onPlayerChange({
        app_language: appLanguage,
        home_currency: homeCurrency,
        spoken_language: spokenLanguage,
        patron_language: patronLanguage,
        units,
        date_format: dateFormat,
      });
      onToast('Saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <FieldGroup>
        <Field>
          <FieldLabel>App language</FieldLabel>
          <ToggleGroup
            type="single"
            value={appLanguage}
            onValueChange={(v) => v && setAppLanguage(v as AppLanguage)}
            aria-label="App language"
          >
            <ToggleGroupItem value="en">English</ToggleGroupItem>
            <ToggleGroupItem value="zh">中文</ToggleGroupItem>
            <ToggleGroupItem value="es">Español</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>
            Menus, labels and buttons. Your notes and drafts are never translated without asking.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Home currency</FieldLabel>
          <ToggleGroup
            type="single"
            value={homeCurrency}
            onValueChange={(v) => v && setHomeCurrency(v as HomeCurrency)}
            aria-label="Home currency"
          >
            <ToggleGroupItem value="AUD">A$ AUD</ToggleGroupItem>
            <ToggleGroupItem value="USD">US$ USD</ToggleGroupItem>
            <ToggleGroupItem value="CNY">¥ Yuan</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>
            Everything is stored in the currency it happened in and converted at that day&apos;s ECB
            rate. Prize money stays in the paying currency until it lands. Patron tiers are priced
            in your home currency through Stripe.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Match Scribe spoken language</FieldLabel>
          <ToggleGroup
            type="single"
            value={spokenLanguage}
            onValueChange={(v) => v && setSpokenLanguage(v as SpokenLanguage)}
            aria-label="Match Scribe spoken language"
          >
            <ToggleGroupItem value="auto">Auto-detect</ToggleGroupItem>
            <ToggleGroupItem value="en">English</ToggleGroupItem>
            <ToggleGroupItem value="zh">中文</ToggleGroupItem>
            <ToggleGroupItem value="es">Español</ToggleGroupItem>
            <ToggleGroupItem value="de">Deutsch</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>Auto-detect handles switching mid-note.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Patron-update language</FieldLabel>
          <ToggleGroup
            type="single"
            value={patronLanguage ?? ''}
            onValueChange={(v) => setPatronLanguage(v || null)}
            aria-label="Patron-update language"
          >
            <ToggleGroupItem value="en">English</ToggleGroupItem>
            <ToggleGroupItem value="de">Deutsch</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>
            The Content Agent drafts your update in this language; you approve every send. The
            Mindset Coach speaks to you in it too.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Units</FieldLabel>
          <ToggleGroup
            type="single"
            value={units}
            onValueChange={(v) => v && setUnits(v as Units)}
            aria-label="Units"
          >
            <ToggleGroupItem value="metric">Metric · kg · °C · km</ToggleGroupItem>
            <ToggleGroupItem value="imperial">Imperial · lb · °F · mi</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>Synced with the tension control in Equipment.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="pref-date-format">Date and number format</FieldLabel>
          <select
            id="pref-date-format"
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value as DateFormat)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            {DATE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      </FieldGroup>
      <div className="flex flex-col gap-2 border-t border-border pt-6">
        <Button onClick={handleSave} disabled={saving}>
          Save
        </Button>
        <p className="text-xs text-muted-foreground">Time zone lives under Account.</p>
      </div>
    </Card>
  );
}
