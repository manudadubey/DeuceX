import Link from 'next/link';
import {
  Empty,
  PulseTileBadge,
  PulseTileLabel,
  PulseTileSub,
  PulseTileValue,
} from '@procircuit/ui';

// The "three answers" dashboard (PROCIRCUIT-CONTEXT.md 5.1), with honest empty states:
// no ranking, agent or fan data exists yet (that's Phase 1 onward), so every tile says so
// and links to the placeholder route that will eventually fill it, rather than showing
// fixture numbers.
const TILES = [
  {
    href: '/agent/financial',
    label: 'Runway',
    sub: 'Appears once the Financial Agent is connected.',
  },
  {
    href: '/agent/tournament',
    label: 'Decision required',
    sub: 'Tournament decisions appear once your ranking is verified.',
  },
  {
    href: '/fans',
    label: 'Patrons since last login',
    sub: 'Appears once Fans is connected.',
  },
] as const;

export default function DashboardPage() {
  return (
    <>
      <Empty title="Your ranking hasn't been verified yet">
        Finish onboarding to verify your ranking and unlock the dashboard.{' '}
        <Link href="/onboarding" className="font-medium text-foreground underline">
          Continue onboarding
        </Link>
      </Empty>

      <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
        {TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-card p-5 text-left text-card-foreground no-underline shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)] transition-shadow hover:shadow-[0_0_0_1px_var(--ring),0_1px_2px_rgba(0,0,0,.05)] max-sm:p-4"
          >
            <PulseTileLabel>{tile.label}</PulseTileLabel>
            <PulseTileBadge />
            <PulseTileValue>—</PulseTileValue>
            <PulseTileSub>{tile.sub}</PulseTileSub>
          </Link>
        ))}
      </div>

      <Empty title="Nothing else to show yet">
        Agent status, the latest Match Scribe note, patron movement and your mood row will appear
        here as each is connected.
      </Empty>
    </>
  );
}
