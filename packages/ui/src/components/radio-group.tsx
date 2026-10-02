import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '../lib/cn';

// Radix RadioGroup: one choice from a set, arrow keys move between options.
export const RadioGroup = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
  return <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-2', className)} {...props} />;
});

// A plain 16px radio dot, for lists of short options.
export const RadioGroupItem = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioGroupItem({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'grid size-4 shrink-0 cursor-pointer place-items-center rounded-full border border-input bg-field',
        'shadow-[0_1px_2px_rgba(0,0,0,.05)]',
        'data-[state=checked]:border-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-primary" />
    </RadioGroupPrimitive.Item>
  );
});

// shadcn's "choice card": a whole card is the radio. The prototype's `.plan` and candidate rows
// (a hairline ring, a 2px --foreground ring when chosen). Children are the card's content.
export const RadioGroupCard = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioGroupCard({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'relative cursor-pointer rounded-lg bg-card text-left text-foreground',
        'shadow-[0_0_0_1px_var(--border)] transition-shadow duration-150 outline-none hover:bg-accent',
        'data-[state=checked]:shadow-[0_0_0_2px_var(--foreground)] data-[state=checked]:hover:bg-card',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
