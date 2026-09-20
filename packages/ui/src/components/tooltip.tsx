import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../lib/cn';

// `[data-tip]` (Baseline §Feedback and overlays "Tooltip"): 12px foreground-on-background,
// 350ms delay, arrow, flips below when there's no room above.
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = (props: ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) => (
  <TooltipPrimitive.Root delayDuration={350} {...props} />
);
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 8, children, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-[60] max-w-[16.25rem] rounded-md bg-foreground px-2.5 py-1.5 text-xs leading-[1.45]',
          'text-background shadow-[0_4px_12px_rgba(0,0,0,.18)] motion-safe:transition-opacity motion-safe:duration-150',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});

export function HelpMark({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="ml-1 inline-grid size-3.5 cursor-help place-items-center rounded-full bg-muted text-[0.625rem] font-semibold text-muted-foreground"
          role="img"
          aria-label={label}
        >
          ?
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
