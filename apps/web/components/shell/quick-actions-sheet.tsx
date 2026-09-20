'use client';

import Link from 'next/link';
import { Mic, Receipt, UtensilsCrossed } from 'lucide-react';
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@procircuit/ui';

// `#qa` (Baseline §Feedback and overlays "Quick actions sheet"), opened from the FAB.
// Menu and receipt scanning don't exist until PRD-08/PRD-03 land, so those two stay
// disabled rather than pretending to work; recording opens the real Match Scribe route.
export function QuickActionsSheet({ children }: { children: React.ReactNode }) {
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
            href="/match-scribe"
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
          <button
            type="button"
            disabled
            title="Coming soon"
            className="flex items-center gap-3 rounded-md p-3 text-left text-sm text-muted-foreground disabled:opacity-50"
          >
            <UtensilsCrossed aria-hidden="true" className="size-5" />
            <span className="flex flex-col">
              <span className="font-medium text-foreground">Scan a menu</span>
              <span className="text-[0.8125rem]">Coming soon</span>
            </span>
          </button>
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
