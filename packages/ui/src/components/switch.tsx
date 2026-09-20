import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../lib/cn';

// role="switch" aria-checked, 32x18 track, ported from Baseline §Controls "Switch".
export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer relative inline-flex h-[1.125rem] w-8 shrink-0 cursor-pointer items-center rounded-full',
        'bg-input shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-colors duration-150',
        'data-[state=checked]:bg-primary',
        'max-[900px]:h-11 max-[900px]:w-11 max-[900px]:min-h-11',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-background transition-transform',
          'duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] data-[state=checked]:translate-x-[0.9375rem]',
          'data-[state=checked]:bg-primary-foreground',
          'max-[900px]:size-4 max-[900px]:data-[state=checked]:translate-x-[1.375rem]',
        )}
      />
    </SwitchPrimitive.Root>
  );
});
