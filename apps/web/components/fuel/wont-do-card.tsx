import { Check } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@deucex/ui';

// FU-16: always present. The photo line follows M-PRIV-1 (register C2):
// extraction is the deletion point, not "within 24 hours".
const ITEMS = [
  {
    t: 'No calorie or weight targets',
    s: 'It answers "what should I order", nothing about your body.',
  },
  {
    t: 'No supplements',
    s: "If you use them, certified batches only, and that's a dietitian conversation.",
  },
  {
    t: 'Allergies are hard rules',
    s: "If it can't read an ingredient, it says so rather than guessing.",
  },
  {
    t: "Photos aren't kept",
    s: "Read once and deleted as soon as the dishes are read. Your choice and the price are what's stored.",
  },
];

export function WontDoCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What Fuel won&apos;t do</CardTitle>
        <CardDescription>On purpose.</CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-3 px-6 pb-6">
        {ITEMS.map((item) => (
          <li key={item.t} className="flex gap-3 text-sm">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ok-bg text-ok">
              <Check aria-hidden="true" className="size-3.5" />
            </span>
            <span>
              <span className="block font-medium">{item.t}</span>
              <span className="text-[0.8125rem] text-muted-foreground">{item.s}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
