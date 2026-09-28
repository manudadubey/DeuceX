'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic } from 'lucide-react';
import { cn } from '@deucex/ui';
import { requestScribeToggle, useScribeRecording } from '@/lib/match-scribe/recorder-bus';
import { QuickActionsSheet } from './quick-actions-sheet';
import { TAB_ITEMS } from './routes';

// `#tabRec` (PRD-02 section 4.6, S-1, S-2): the raised record disc. Anywhere else it
// opens the Capture sheet (Record a note is the second tap); on /match-scribe it
// starts or stops the recorder directly, and pulses while recording.
function ScribeTab({ isFree, onPage }: { isFree: boolean; onPage: boolean }) {
  const recording = useScribeRecording();
  const disc = (
    <span
      className={cn(
        'relative -mt-4 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground',
        'shadow-[0_6px_16px_rgba(0,0,0,.2),0_0_0_4px_var(--background)]',
        recording && 'bg-destructive text-white',
      )}
    >
      {recording && (
        <span
          aria-hidden="true"
          className="absolute -inset-1 rounded-full border-2 border-destructive opacity-50 motion-safe:animate-ping"
        />
      )}
      <Mic aria-hidden="true" className="size-[1.375rem] stroke-[1.75]" />
    </span>
  );
  const className = cn(
    'flex min-h-12 flex-col items-center justify-end gap-0.5 rounded-md text-[0.6875rem] font-medium',
    onPage ? 'text-foreground' : 'text-muted-foreground',
  );
  if (onPage) {
    return (
      <button
        type="button"
        aria-label={recording ? 'Stop recording' : 'Record a Match Scribe note'}
        aria-pressed={recording}
        onClick={requestScribeToggle}
        className={className}
      >
        {disc}
        <span>{recording ? 'Stop' : 'Scribe'}</span>
      </button>
    );
  }
  return (
    <QuickActionsSheet isFree={isFree}>
      <button type="button" aria-label="Record a Match Scribe note" className={className}>
        {disc}
        <span>Scribe</span>
      </button>
    </QuickActionsSheet>
  );
}

// `.tabbar` (Baseline §Shells and routes): appears under 900px in place of the sidebar.
export function TabBar({ isFree = true }: { isFree?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-[25] hidden grid-cols-5 items-end border-t border-border',
        'bg-background/78 px-2 pt-1.5 backdrop-blur-xl backdrop-saturate-[1.8]',
        'pb-[calc(0.375rem+env(safe-area-inset-bottom))] max-[900px]:grid',
      )}
    >
      {TAB_ITEMS.map((item) => {
        if (item.href === '/match-scribe') {
          return (
            <ScribeTab key={item.href} isFree={isFree} onPage={pathname === '/match-scribe'} />
          );
        }
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[0.6875rem]',
              'font-medium text-muted-foreground no-underline',
              active && 'text-foreground',
            )}
          >
            <Icon aria-hidden="true" className="size-[1.375rem] stroke-[1.75]" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
