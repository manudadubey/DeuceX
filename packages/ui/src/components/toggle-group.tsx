'use client';

import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  createContext,
  forwardRef,
  useContext,
} from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';

// Two prototype idioms share Radix's toggle group (docs/deucex-baseline.html §Controls):
// - `default` is `.tg`: separate bordered buttons, 6px apart, wrapping; the chosen one
//   fills with primary. Context, mood, the 1–5 check-in, preferences, surfaces.
// - `segmented` is `.seg`: one muted track, the chosen item lifted onto a field
//   background. Filters, the kg/lb unit, Monthly/Yearly (same look as Tabs' TabsList).
type ToggleGroupVariant = 'default' | 'segmented';

const VariantContext = createContext<ToggleGroupVariant>('default');

const rootVariants = cva('', {
  variants: {
    variant: {
      default: 'flex flex-wrap gap-1.5',
      segmented: [
        'inline-flex h-9 max-w-full min-w-0 flex-none gap-0.5 self-start overflow-x-auto rounded-lg bg-muted p-[3px]',
        '[scrollbar-width:none] max-[900px]:h-auto max-[900px]:flex-wrap',
      ],
    },
  },
  defaultVariants: { variant: 'default' },
});

type ToggleGroupProps = ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> & {
  variant?: ToggleGroupVariant;
};

export const ToggleGroup = forwardRef<
  ElementRef<typeof ToggleGroupPrimitive.Root>,
  ToggleGroupProps
>(function ToggleGroup({ className, variant = 'default', ...props }, ref) {
  return (
    <VariantContext.Provider value={variant}>
      <ToggleGroupPrimitive.Root
        ref={ref}
        className={cn(rootVariants({ variant }), className)}
        {...(props as ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>)}
      />
    </VariantContext.Provider>
  );
});

const itemVariants = cva('', {
  variants: {
    variant: {
      default: [
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-secondary text-foreground',
        'text-sm font-medium shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-colors duration-150 hover:bg-accent',
        'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
        'max-[900px]:min-h-11',
      ],
      segmented: [
        'inline-flex h-[1.8125rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3',
        'text-sm font-medium text-muted-foreground transition-[background-color,box-shadow,color] duration-150',
        'hover:text-foreground max-[900px]:min-h-11',
        'data-[state=on]:border-input data-[state=on]:bg-field data-[state=on]:text-foreground',
        'data-[state=on]:shadow-[0_1px_3px_rgba(0,0,0,.1),0_1px_2px_-1px_rgba(0,0,0,.1)]',
      ],
    },
    size: {
      default: '',
      sm: '',
    },
  },
  compoundVariants: [
    { variant: 'default', size: 'default', className: 'h-9 px-3' },
    { variant: 'default', size: 'sm', className: 'h-[1.875rem] px-2.5 text-[0.8125rem]' },
  ],
  defaultVariants: { variant: 'default', size: 'default' },
});

export const ToggleGroupItem = forwardRef<
  ElementRef<typeof ToggleGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> & { size?: 'default' | 'sm' }
>(function ToggleGroupItem({ className, size = 'default', ...props }, ref) {
  const variant = useContext(VariantContext);
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(itemVariants({ variant, size }), className)}
      {...props}
    />
  );
});
