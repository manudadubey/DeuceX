'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@deucex/ui';
import { setMealOutcome, type MealLogRow } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { localDate } from '@/lib/fuel/load';

// PRD-07 section 4.2: "The next morning the Match Scribe note or Mindset
// check-in shows one line, 'Last night: grilled chicken breast with rice at
// the hotel. Worked, or flat?'" No push, no email (section 9), no model.
export function MealOutcomeLine({
  playerId,
  timezone,
  onToast,
}: {
  playerId: string;
  timezone: string;
  onToast?: ((title: string) => void) | undefined;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [meal, setMeal] = useState<MealLogRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const today = new Date(`${localDate(timezone)}T00:00:00Z`);
    today.setUTCDate(today.getUTCDate() - 1);
    const yesterday = today.toISOString().slice(0, 10);
    void supabase
      .from('meal_logs')
      .select('*')
      .eq('player_id', playerId)
      .eq('local_date', yesterday)
      .eq('outcome', 'none')
      .order('logged_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setMeal(data));
  }, [supabase, playerId, timezone]);

  if (!meal) return null;

  const answer = async (outcome: 'worked' | 'flat') => {
    setSaving(true);
    try {
      await setMealOutcome(supabase, meal.id, outcome, 'tap-checkin');
      onToast?.(outcome === 'worked' ? 'Noted: it worked' : 'Noted: flat next day');
      setMeal(null);
    } finally {
      setSaving(false);
    }
  };

  const dish = meal.dish_english.charAt(0).toLowerCase() + meal.dish_english.slice(1);
  const where = meal.venue_name && /hotel/i.test(meal.venue_name) ? ' at the hotel' : '';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm">
      <span className="flex-1">
        Last night: {dish}
        {where}. Worked, or flat?
      </span>
      <Button size="sm" variant="outline" disabled={saving} onClick={() => void answer('worked')}>
        Worked
      </Button>
      <Button size="sm" variant="outline" disabled={saving} onClick={() => void answer('flat')}>
        Flat
      </Button>
    </div>
  );
}
