import Link from 'next/link';
import { Phone } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle, buttonVariants } from '@deucex/ui';

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
// "Name and number" as typed in Settings > Data & safety: the first run of
// digits (with an optional leading +) is the number, the rest the name.
export function parseContact(contact: string): {
  name: string;
  tel: string | null;
  shown: string | null;
} {
  const match = contact.match(/\+?\d[\d\s().-]{5,}\d/);
  if (!match) return { name: contact.trim(), tel: null, shown: null };
  const shown = match[0].trim();
  const name = contact
    .replace(match[0], '')
    .replace(/[,·:\-–]+\s*$/, '')
    .replace(/^\s*[,·:\-–]+/, '')
    .trim();
  return { name: name || 'Your contact', tel: shown.replace(/[^\d+]/g, ''), shown };
}

export function SomeoneToCallCard({
  contact,
  tour,
}: {
  /** players.emergency_contact, set in Settings > Data & safety (MC-16's named contact). */
  contact: string | null;
  tour: string | null;
}) {
  const person = contact?.trim() ? parseContact(contact) : null;
  const programme =
    tour === 'wta'
      ? 'WTA Player Assistance Program'
      : tour === 'atp'
        ? 'ATP Player Assistance Program'
        : 'ATP / WTA Player Assistance Program';
  return (
    <Card>
      <CardHeader>
        <CardTitle>This reads like more than a bad week</CardTitle>
        <CardDescription>Coaching can wait. Talk to someone today.</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3 px-6">
        {person ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 p-3.5 text-sm">
            <div>
              <div className="font-medium">{person.name}</div>
              <div className="text-[0.8125rem] text-muted-foreground">
                {person.shown ?? 'The person you named in Settings'}
              </div>
            </div>
            {person.tel && (
              <a href={`tel:${person.tel}`} className={buttonVariants({ size: 'sm' })}>
                <Phone aria-hidden="true" className="size-4" />
                Call
              </a>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-secondary/50 p-3.5 text-[0.8125rem] text-muted-foreground">
            Nobody named yet. Add someone you trust under{' '}
            <Link href="/settings" className="font-medium text-foreground underline">
              Settings, Data &amp; safety
            </Link>
            , so they show here with a call button.
          </div>
        )}
        <div className="rounded-lg bg-secondary/50 p-3.5 text-sm">
          <div className="font-medium">{programme}</div>
          <div className="text-[0.8125rem] text-muted-foreground">
            Number pending verification, so it isn&apos;t shown here until confirmed. Your
            tour&apos;s player relations team or your national federation can connect you.
          </div>
        </div>
        <p className="text-[0.8125rem] text-muted-foreground">
          If you might hurt yourself, call your local emergency number now. A local crisis line will
          show here once it&apos;s verified for your country.
        </p>
      </div>
    </Card>
  );
}
