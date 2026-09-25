'use client';

import { Mic } from 'lucide-react';
import { cn } from '@deucex/ui';
import { QuickActionsSheet } from './quick-actions-sheet';

// `.fab` (Baseline §Shells and routes "floating capture button"): desktop only. Under
// 900px the mobile tab bar's own record tab (tab-bar.tsx) replaces it.
export function Fab() {
  return (
    <QuickActionsSheet>
      <button
        type="button"
        aria-label="Capture: record a note, scan a menu or a receipt"
        className={cn(
          'fixed right-7 bottom-7 z-20 inline-flex h-[3.25rem] items-center gap-2.5 rounded-full',
          'bg-primary pr-5 pl-4 text-sm font-medium text-primary-foreground',
          'shadow-[0_8px_24px_rgba(0,0,0,.18),0_0_0_1px_var(--border)] transition-transform',
          'hover:-translate-y-px max-[900px]:hidden',
        )}
      >
        <Mic aria-hidden="true" className="size-4" />
        <span>Match Scribe</span>
      </button>
    </QuickActionsSheet>
  );
}
