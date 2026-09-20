'use client';

import { Bell } from 'lucide-react';
import {
  Button,
  Empty,
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@procircuit/ui';

// `#nt` (Baseline §Feedback and overlays): the notification rail. No agent writes
// notifications yet (that starts in Phase 1), so this is a real, honest empty state
// rather than fixture data.
export function NotificationSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Notifications">
          <Bell aria-hidden="true" className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetCloseButton />
        </SheetHeader>
        <SheetDescription className="sr-only">
          Notifications from your agents will appear here.
        </SheetDescription>
        <Empty title="No notifications yet">
          Agents will post here once there is something for you to see or decide.
        </Empty>
      </SheetContent>
    </Sheet>
  );
}
