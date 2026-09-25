'use client';

import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  FLAG_CODES,
  Flag,
  type FlagCode,
} from '@deucex/ui';
import { MODE_LABEL, type FuelMode } from '@deucex/agents';
import type { FuelHistoryRow } from '@/lib/fuel/load';
import { formatHome, shortDate } from '@/lib/fuel/format';

function flagFor(country: string | null): FlagCode | null {
  const code = country?.toUpperCase() ?? '';
  return (FLAG_CODES as readonly string[]).includes(code) ? (code as FlagCode) : null;
}

// PRD-07 section 4.1 "Where you've eaten" (FU-14, FU-15): newest first,
// with the outcome tap for any meal from before today.
export function HistoryCard({
  rows,
  today,
  homeCurrency,
  busy,
  onOutcome,
}: {
  rows: FuelHistoryRow[];
  today: string;
  homeCurrency: string;
  busy: boolean;
  onOutcome: (mealId: string, outcome: 'worked' | 'flat') => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where you&apos;ve eaten</CardTitle>
        <CardDescription>What worked, by city. The second visit is faster.</CardDescription>
      </CardHeader>
      <div className="px-6 pb-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing logged yet. The dishes you choose show up here, by city.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map(({ meal, priceHome }) => {
              const flag = flagFor(meal.country);
              const place = [meal.city, meal.venue_name].filter(Boolean).join(' · ') || 'Menu scan';
              const inferred = meal.outcome_source === 'inferred-mood';
              return (
                <li key={meal.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {flag && <Flag code={flag} />}
                      {place}
                    </span>
                    <span className="text-[0.8125rem] text-muted-foreground">
                      {meal.dish_english}, {MODE_LABEL[meal.mode as FuelMode].toLowerCase()} ·{' '}
                      {meal.local_date === today ? 'tonight' : shortDate(meal.local_date)}
                      {priceHome !== null ? ` · ${formatHome(priceHome, homeCurrency)}` : ''}
                    </span>
                  </span>
                  {meal.outcome === 'worked' ? (
                    <Badge
                      variant="ok"
                      className={inferred ? 'opacity-60' : undefined}
                      title={inferred ? "Inferred from the next day's mood" : undefined}
                    >
                      Worked
                    </Badge>
                  ) : meal.outcome === 'flat' ? (
                    <Badge
                      variant="warn"
                      className={inferred ? 'opacity-60' : undefined}
                      title={inferred ? "Inferred from the next day's mood" : undefined}
                    >
                      Flat next day
                    </Badge>
                  ) : meal.local_date === today ? (
                    <Badge variant="secondary">Tell me tomorrow</Badge>
                  ) : (
                    <span className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onOutcome(meal.id, 'worked')}
                      >
                        Worked
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onOutcome(meal.id, 'flat')}
                      >
                        Flat
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
