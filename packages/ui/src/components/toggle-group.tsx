import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';

// `.tg` (Baseline §Controls "Toggle group"), also used as the kg/lb segmented control
// (`.seg`-adjacent idiom) via `aria-pressed`/`data-state`.
export const ToggleGroup = ToggleGroupPrimitive.Root;

const itemVariants = cva(
  [
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-secondary text-foreground',
    'text-sm font-medium shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-colors duration-150 hover:bg-accent',
    'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
    'max-[900px]:min-h-11',
  ],
  {
    variants: {
      size: {
        default: 'h-9 px-3',
        sm: 'h-[1.875rem] px-2.5 text-[0.8125rem]',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export const ToggleGroupItem = forwardRef<
  ElementRef<typeof ToggleGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> & { size?: 'default' | 'sm' }
>(function ToggleGroupItem({ className, size = 'default', ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(itemVariants({ size }), className)}
      {...props}
    />
  );
});
