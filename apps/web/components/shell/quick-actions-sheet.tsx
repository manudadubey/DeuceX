'use client';

import Link from 'next/link';
import { Lock, Mic, Receipt, UtensilsCrossed } from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@deucex/ui';

// `#qa` (Baseline §Feedback and overlays "Quick actions sheet"), opened from the FAB.
// Recording opens the real Match Scribe route. Scan a menu (step 4.3, PRD-07 section 4.2)
// opens `/fuel` with Take photo focused; on Free it shows the lock and opens the locked
// Fuel page instead, never the camera (decisions worksheet 15). Receipt scanning lives on
// the Financial Agent page, so its shortcut here stays disabled for now.
export function QuickActionsSheet({
  isFree,
  children,
}: {
  isFree: boolean;
  children: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Capture</SheetTitle>
          <SheetCloseButton />
        </SheetHeader>
        <SheetDescription className="sr-only">
          Quick ways to capture a note, a menu or a receipt.
        </SheetDescription>
        <div className="flex flex-col gap-1 px-3 pb-4">
          <Link
            href="/match-scribe?record=1"
            className="flex items-center gap-3 rounded-md p-3 text-sm hover:bg-accent"
          >
            <Mic aria-hidden="true" className="size-5 text-muted-foreground" />
            <span className="flex flex-col">
              <span className="font-medium">Record a note</span>
              <span className="text-[0.8125rem] text-muted-foreground">
                Sixty seconds after a match or practice
              </span>
            </span>
          </Link>
          <SheetClose asChild>
            <Link
              href={isFree ? '/fuel' : '/fuel?take=1'}
              className="flex items-center gap-3 rounded-md p-3 text-sm hover:bg-accent"
            >
              <UtensilsCrossed aria-hidden="true" className="size-5 text-muted-foreground" />
              <span className="flex flex-1 flex-col">
                <span className="font-medium">Scan a menu</span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {isFree
                    ? 'Pro · what to order tonight'
                    : "What to order tonight, for tomorrow's match"}
                </span>
              </span>
              {isFree && <Lock aria-label="Pro feature" className="size-4 text-muted-foreground" />}
            </Link>
          </SheetClose>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="flex items-center gap-3 rounded-md p-3 text-left text-sm text-muted-foreground disabled:opacity-50"
          >
            <Receipt aria-hidden="true" className="size-5" />
            <span className="flex flex-col">
              <span className="font-medium text-foreground">Scan a receipt</span>
              <span className="text-[0.8125rem]">Coming soon</span>
            </span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
