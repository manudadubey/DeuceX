import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// KPI row tile (Baseline §Typography "Stat value"; `.stats > div`).
export function Stat({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-bl-card=""
      className={cn(
        'rounded-xl bg-card px-5 py-4 shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)]',
        className,
      )}
      {...props}
    />
  );
}

export function StatLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-[0.8125rem] text-muted-foreground', className)} {...props} />;
}

export function StatValue({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mt-1 font-mono text-[1.75rem] leading-[1.1] font-medium tracking-[-0.02em]',
        '[&_small]:text-sm [&_small]:font-normal [&_small]:tracking-normal [&_small]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function StatSub({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-1.5 text-xs text-muted-foreground', className)} {...props} />;
}

export function StatsRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('grid grid-cols-4 gap-4 max-sm:grid-cols-2 max-sm:gap-2.5', className)}
      {...props}
    />
  );
}
