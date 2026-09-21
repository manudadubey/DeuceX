import { Card, CardDescription, CardHeader, CardTitle } from '@procircuit/ui';

// M-PRIV-3/MC-16: replaces the insight whenever the distress rule fires.
// No dismiss control and no disabling setting, by design — see
// packages/agents/src/mindset-coach/distress.ts and the migration's `cases`
// table.
//
// Deliberately does NOT hardcode a phone number for the ATP Player
// Assistance line or a country's crisis line here: this card can be shown
// to a player in genuine distress, so a guessed or unverified number is
// actively dangerous, worse than an honest gap (PRD-00 M-PRIV-5's real-
// person-governance principle applied to the same standard here). The named
// contact (Settings > Connections) and a sourced per-country/tour resource
// list are PRD-06 section 12's own open question and PRD-12 (step 2.3);
// until a real, verified number is wired in, this names the resources
// without inventing digits for them. Do not fill this in with a plausible-
// looking number without confirming it against the real ATP/WTA player
// assistance program and the player's own country.
export function SomeoneToCallCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This reads like more than a bad week</CardTitle>
        <CardDescription>Coaching can wait.</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3 px-6">
        <div className="rounded-lg bg-secondary/50 p-3.5 text-sm">
          <div className="font-medium">ATP / WTA Player Assistance Program</div>
          <div className="text-[0.8125rem] text-muted-foreground">
            Number pending verification — not shown here until confirmed. Ask your national
            federation or tour player relations contact in the meantime.
          </div>
        </div>
        <p className="text-[0.8125rem] text-muted-foreground">
          A local crisis line will show here once it&apos;s sourced for your country in Settings
          &gt; Connections. It won&apos;t pretend to be a person who knows you.
        </p>
      </div>
    </Card>
  );
}
