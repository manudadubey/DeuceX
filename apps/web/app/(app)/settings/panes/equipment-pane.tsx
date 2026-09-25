'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from '@deucex/ui';
import {
  getEquipmentProfile,
  updateUnits,
  upsertEquipmentProfile,
  type RestringCadence,
} from '@deucex/db';
import { toDisplayKg, type Unit } from '@deucex/agents';
import { createClient } from '@/lib/supabase/client';
import { requestConditionsReRun } from '@/lib/conditions/api';

const PRACTICE_BALL_OPTIONS = ['Dunlop Fort', 'Head Tour', 'Wilson US Open', 'Babolat Team'];

const RESTRING_CADENCES: { value: RestringCadence; label: string }[] = [
  { value: 'everyMatch', label: 'Every match' },
  { value: 'every8to10Sets', label: 'Every 8–10 sets' },
  { value: 'whenDead', label: 'When it feels dead' },
];

function toKg(displayed: number, unit: Unit): number {
  return unit === 'kg' ? displayed : Math.round((displayed / 2.2046) * 10) / 10;
}

// PRD-08 section 4.5. The four to six fields, the two toggle groups
// (frames carried isn't a field this pane exposes as a raw number input —
// 3 to 6, matching the profile's own check constraint — and practice
// balls) and the stamp switch, with the kg/lb control synced to
// Preferences > Units and the Conditions brief's own inline toggle (CE-17).
export function EquipmentPane({
  playerId,
  initialUnits,
  onUnitsChange,
  onToast,
}: {
  playerId: string;
  initialUnits: 'metric' | 'imperial';
  /** CE-17: keeps SettingsShell's shared player state (and so Preferences' own Units control) in sync within the same session. */
  onUnitsChange: (units: 'metric' | 'imperial') => void;
  onToast: (title: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loaded, setLoaded] = useState(false);
  const [frame, setFrame] = useState('Wilson Blade 98');
  const [stringName, setStringName] = useState('Luxilon Alu Power 1.25');
  const [mainsKg, setMainsKg] = useState(24);
  const [crossesKg, setCrossesKg] = useState(23);
  const [framesCarried, setFramesCarried] = useState(4);
  const [restringCadence, setRestringCadence] = useState<RestringCadence>('every8to10Sets');
  const [overgrip, setOvergrip] = useState('Tourna Grip');
  const [practiceBalls, setPracticeBalls] = useState<string[]>(['Dunlop Fort']);
  const [stampSwitch, setStampSwitch] = useState(true);
  const [unit, setUnit] = useState<Unit>(initialUnits === 'imperial' ? 'lb' : 'kg');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const profile = await getEquipmentProfile(supabase, playerId);
      if (profile) {
        setFrame(profile.frame ?? 'Wilson Blade 98');
        setStringName(profile.string ?? 'Luxilon Alu Power 1.25');
        setMainsKg(profile.tension_mains_kg);
        setCrossesKg(profile.tension_crosses_kg);
        setFramesCarried(profile.frames_carried);
        setRestringCadence(profile.restring_cadence as RestringCadence);
        setOvergrip(profile.overgrip ?? 'Tourna Grip');
        setPracticeBalls(
          Array.isArray(profile.practice_balls)
            ? (profile.practice_balls as string[])
            : ['Dunlop Fort'],
        );
        setStampSwitch(profile.stamp_switch);
      }
      setLoaded(true);
    })();
  }, [supabase, playerId]);

  const toggleBall = (ball: string) => {
    setPracticeBalls((prev) =>
      prev.includes(ball) ? prev.filter((b) => b !== ball) : [...prev, ball],
    );
  };

  const handleUnitChange = async (next: Unit) => {
    setUnit(next);
    const nextUnits = next === 'lb' ? 'imperial' : 'metric';
    await updateUnits(supabase, { playerId, units: nextUnits });
    onUnitsChange(nextUnits);
    onToast(`Tension shown in ${next}`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertEquipmentProfile(supabase, {
        playerId,
        frame,
        string: stringName,
        tensionMainsKg: mainsKg,
        tensionCrossesKg: crossesKg,
        framesCarried,
        restringCadence,
        overgrip,
        practiceBalls,
        stampSwitch,
      });
      await requestConditionsReRun(supabase);
      onToast('Saved · next brief uses the new baseline');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card className="gap-6 p-6">
      <CardHeader className="flex-row items-center justify-between p-0">
        <CardTitle>Equipment · What you play with.</CardTitle>
        <ToggleGroup
          type="single"
          value={unit}
          onValueChange={(v) => v && handleUnitChange(v as Unit)}
          aria-label="Tension unit"
        >
          <ToggleGroupItem value="kg">kg</ToggleGroupItem>
          <ToggleGroupItem value="lb">lb</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="equip-frame">Frame</FieldLabel>
          <input
            id="equip-frame"
            value={frame}
            onChange={(e) => setFrame(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-field px-2.5 text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none focus:border-ring"
            placeholder="Wilson Blade 98 · 16×19 · 305 g"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="equip-string">String</FieldLabel>
          <input
            id="equip-string"
            value={stringName}
            onChange={(e) => setStringName(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-field px-2.5 text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none focus:border-ring"
            placeholder="Luxilon Alu Power 1.25 · full bed"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <Field>
            <FieldLabel htmlFor="equip-mains">Tension · mains ({unit})</FieldLabel>
            <input
              id="equip-mains"
              type="number"
              value={toDisplayKg(mainsKg, unit)}
              onChange={(e) => setMainsKg(toKg(Number(e.target.value), unit))}
              className="h-9 w-full rounded-md border border-input bg-field px-2.5 font-mono text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none focus:border-ring"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="equip-crosses">Tension · crosses ({unit})</FieldLabel>
            <input
              id="equip-crosses"
              type="number"
              value={toDisplayKg(crossesKg, unit)}
              onChange={(e) => setCrossesKg(toKg(Number(e.target.value), unit))}
              className="h-9 w-full rounded-md border border-input bg-field px-2.5 font-mono text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none focus:border-ring"
            />
          </Field>
        </div>
        <FieldDescription>
          Your indoor baseline. Briefs quote changes against this. Switch units top right; 1 kg is
          about 2.2 lb.
        </FieldDescription>

        <Field>
          <FieldLabel>Frames you travel with</FieldLabel>
          <ToggleGroup
            type="single"
            value={String(framesCarried)}
            onValueChange={(v) => v && setFramesCarried(Number(v))}
            aria-label="Frames you travel with"
          >
            {[3, 4, 5, 6].map((n) => (
              <ToggleGroupItem key={n} value={String(n)}>
                {n}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field>
          <FieldLabel>Restring cadence</FieldLabel>
          <ToggleGroup
            type="single"
            value={restringCadence}
            onValueChange={(v) => v && setRestringCadence(v as RestringCadence)}
            aria-label="Restring cadence"
          >
            {RESTRING_CADENCES.map((c) => (
              <ToggleGroupItem key={c.value} value={c.value}>
                {c.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="equip-overgrip">Overgrip</FieldLabel>
          <input
            id="equip-overgrip"
            value={overgrip}
            onChange={(e) => setOvergrip(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-field px-2.5 text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none focus:border-ring"
            placeholder="Tourna Grip · fresh every match in heat"
          />
        </Field>

        <Field>
          <FieldLabel>
            Balls you practise with <small>· pick any</small>
          </FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {PRACTICE_BALL_OPTIONS.map((ball) => (
              <button
                key={ball}
                type="button"
                aria-pressed={practiceBalls.includes(ball)}
                onClick={() => toggleBall(ball)}
                className="inline-flex h-[1.875rem] items-center rounded-md border border-input bg-secondary px-2.5 text-[0.8125rem] font-medium aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                {ball}
              </button>
            ))}
          </div>
          <FieldDescription>
            The brief flags it when it differs from what you&apos;ve been hitting.
          </FieldDescription>
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <Switch checked={stampSwitch} onCheckedChange={setStampSwitch} />
          Stamp Match Scribe notes with conditions
        </label>
        <FieldDescription>Patterns need this on.</FieldDescription>
      </FieldGroup>

      <div className="border-t border-border pt-6">
        <Button onClick={handleSave} disabled={saving}>
          Save
        </Button>
      </div>
    </Card>
  );
}
