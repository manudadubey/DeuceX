import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../lib/cn';

// The Vega segmented control (Baseline §Controls "Tabs (segmented)"): a `.seg` list on
// a muted track, active trigger lifted with a field background and a soft shadow.
export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex h-9 max-w-full min-w-0 flex-none gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px]',
        '[scrollbar-width:none] max-[900px]:h-auto max-[900px]:flex-wrap',
        className,
      )}
      {...props}
    />
  );
});

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'h-[1.8125rem] shrink-0 rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap',
        'text-muted-foreground transition-[background-color,box-shadow] duration-150 max-[900px]:min-h-11',
        'data-[state=active]:bg-field data-[state=active]:border-input data-[state=active]:text-foreground',
        'data-[state=active]:shadow-[0_1px_3px_rgba(0,0,0,.1),0_1px_2px_-1px_rgba(0,0,0,.1)]',
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = TabsPrimitive.Content;
