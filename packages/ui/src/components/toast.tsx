import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cn } from '../lib/cn';

// `.toast` (Baseline §Feedback and overlays): popover surface, bottom centre, 2.6s,
// never stacked. Confirms what just happened in the same words the consequence sentence used.
export const ToastProvider = (props: ComponentPropsWithoutRef<typeof ToastPrimitive.Provider>) => (
  <ToastPrimitive.Provider duration={2600} {...props} />
);

export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(function ToastViewport({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Viewport
      ref={ref}
      className={cn(
        'fixed bottom-7 left-1/2 z-30 flex max-w-[90vw] -translate-x-1/2 flex-col gap-2 outline-none',
        'max-[900px]:bottom-[calc(5.25rem+env(safe-area-inset-bottom))]',
        className,
      )}
      {...props}
    />
  );
});

export const Toast = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root>
>(function Toast({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        'flex items-center gap-2 rounded-lg bg-popover px-3.5 py-2.5 text-[0.8125rem] text-popover-foreground',
        'shadow-[0_0_0_1px_var(--border),0_8px_24px_rgba(0,0,0,.14)]',
        'data-[state=open]:animate-[bl-fade_150ms_ease] data-[state=closed]:opacity-0',
        'transition-opacity duration-150',
        className,
      )}
      {...props}
    />
  );
});

export const ToastTitle = ToastPrimitive.Title;
export const ToastDescription = ToastPrimitive.Description;
export const ToastClose = ToastPrimitive.Close;
