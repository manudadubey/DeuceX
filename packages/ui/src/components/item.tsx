import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// `.item` (Baseline §Fields "Item row"): media, title, description, actions.
export function Item({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_auto] items-center gap-x-3.5 gap-y-1 rounded-md bg-secondary/50 p-3.5',
        className,
      )}
      {...props}
    />
  );
}

export function ItemMedia({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'row-span-2 grid size-8 place-items-center rounded-md bg-muted text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function ItemTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-sm font-medium', className)} {...props} />;
}

export function ItemDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('col-start-2 text-[0.8125rem] text-muted-foreground', className)}
      {...props}
    />
  );
}

export function ItemActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('col-start-3 row-span-2 flex items-center gap-1.5', className)} {...props} />
  );
}
