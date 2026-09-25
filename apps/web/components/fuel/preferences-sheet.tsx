'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  ToggleGroup,
  ToggleGroupItem,
} from '@deucex/ui';
import {
  ALLERGEN_NAME,
  FUEL_ALLERGENS,
  FUEL_EXCLUSIONS,
  type DietaryProfile,
  type FuelAllergen,
  type FuelExclusion,
} from '@deucex/agents';

const EXCLUSION_NAME: Record<FuelExclusion, string> = {
  pork: 'Pork',
  beef: 'Beef',
  lamb: 'Lamb',
  meat: 'All meat',
  fish: 'Fish',
  shellfish: 'Shellfish',
  alcohol: 'Alcohol',
};

// FU-21: the dietary profile as three separate lists, edited only here
// (owner decision, step 4.3). Exclusions and allergies are closed lists so
// the hard filter can be exact; preferences are free words that only
// re-rank.
export function PreferencesSheet({
  open,
  onOpenChange,
  profile,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: DietaryProfile;
  onSave: (profile: DietaryProfile) => Promise<void>;
}) {
  const [exclusions, setExclusions] = useState<string[]>(profile.exclusions);
  const [allergies, setAllergies] = useState<string[]>(profile.allergies);
  const [prefs, setPrefs] = useState(profile.preferences.join(', '));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setExclusions(profile.exclusions);
      setAllergies(profile.allergies);
      setPrefs(profile.preferences.join(', '));
    }
  }, [open, profile]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        exclusions: exclusions as FuelExclusion[],
        allergies: allergies as FuelAllergen[],
        preferences: prefs
          .split(',')
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Preferences</SheetTitle>
          <SheetCloseButton />
        </SheetHeader>
        <SheetDescription className="px-6 text-sm text-muted-foreground">
          Exclusions and allergies are hard rules: a dish that contains one is never a pick.
          Preferences only move dishes up the list.
        </SheetDescription>
        <div className="flex flex-col gap-6 px-6 py-4">
          <Field>
            <FieldLabel>Never pick</FieldLabel>
            <ToggleGroup
              type="multiple"
              value={exclusions}
              onValueChange={setExclusions}
              className="flex flex-wrap gap-1.5"
              aria-label="Exclusions"
            >
              {FUEL_EXCLUSIONS.map((e) => (
                <ToggleGroupItem key={e} value={e} size="sm">
                  {EXCLUSION_NAME[e]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel>Allergies</FieldLabel>
            <ToggleGroup
              type="multiple"
              value={allergies}
              onValueChange={setAllergies}
              className="flex flex-wrap gap-1.5"
              aria-label="Allergies"
            >
              {FUEL_ALLERGENS.map((a) => (
                <ToggleGroupItem key={a} value={a} size="sm">
                  {ALLERGEN_NAME[a].charAt(0).toUpperCase() + ALLERGEN_NAME[a].slice(1)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              Read from the menu, so always confirm with the kitchen as well.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="fuel-prefs">Prefers</FieldLabel>
            <Input
              id="fuel-prefs"
              placeholder="fish, chicken"
              value={prefs}
              onChange={(e) => setPrefs(e.target.value)}
            />
            <FieldDescription>Separate with commas.</FieldDescription>
          </Field>
        </div>
        <SheetFooter>
          <Button onClick={() => void save()} disabled={saving}>
            Save preferences
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
