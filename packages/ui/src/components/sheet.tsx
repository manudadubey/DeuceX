import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './button';

// `.nt` / scrim (Baseline §Feedback and overlays "Sheets and menus"): anchored, translucent,
// traps focus, closes on Escape and scrim tap. `side="right"` is the notification rail,
// `side="bottom"` is quick actions (a full-width sheet on mobile).
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function SheetOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-[44] bg-black/40 transition-opacity duration-200',
        'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
        className,
      )}
      {...props}
    />
  );
});

const sideClass: Record<'right' | 'bottom', string> = {
  right: cn(
    'right-0 top-0 bottom-0 w-[25rem] max-w-[100vw] border-l border-border',
    'data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
  ),
  bottom: cn(
    'bottom-0 right-0 w-full sm:w-80 sm:right-4 sm:bottom-4 sm:rounded-xl border-t border-border sm:border',
    'data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
  ),
};

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: 'right' | 'bottom' }
>(function SheetContent({ className, side = 'right', children, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-bl-translucent=""
        className={cn(
          'fixed z-[45] flex flex-col bg-background/92 text-foreground shadow-[-16px_0_48px_rgba(0,0,0,.25)]',
          'backdrop-blur-xl backdrop-saturate-[1.8] transition-transform duration-[320ms]',
          'ease-[cubic-bezier(0.2,0.8,0.2,1)] outline-none',
          sideClass[side],
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export function SheetHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('flex items-center gap-2.5 px-4 pt-4 pb-3 sm:pl-5', className)} {...props} />
  );
}

export const SheetTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-base font-medium', className)}
      {...props}
    />
  );
});

export const SheetDescription = DialogPrimitive.Description;

export function SheetCloseButton({ className }: { className?: string }) {
  return (
    <SheetClose asChild>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        className={cn('ml-auto', className)}
      >
        <X className="size-4" />
      </Button>
    </SheetClose>
  );
}

export function SheetFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-[0.8125rem]',
        'text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
