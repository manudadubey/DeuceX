import { type ButtonHTMLAttributes, type HTMLAttributes, forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';

// The three-answers tile (Baseline §Pattern · the three answers): a button that goes
// to its agent, one glance value, and either a meter or a sparkline underneath.
export interface PulseTileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'warn' | 'danger';
}

const toneValueClass = cva('', {
  variants: {
    tone: {
      default: '',
      warn: '[&_[data-tile-value]]:text-warn',
      danger: '[&_[data-tile-value]]:text-danger',
    },
  },
  defaultVariants: { tone: 'default' },
});

export const PulseTile = forwardRef<HTMLButtonElement, PulseTileProps>(function PulseTile(
  { className, tone = 'default', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-bl-card=""
      className={cn(
        'relative grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-card p-5 text-left text-card-foreground',
        'shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)] transition-shadow duration-150',
        'hover:shadow-[0_0_0_1px_var(--ring),0_1px_2px_rgba(0,0,0,.05)]',
        'active:scale-[0.985] active:duration-[120ms] max-sm:p-4',
        toneValueClass({ tone }),
        className,
      )}
      {...props}
    />
  );
});

export function PulseTileLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'col-span-1 flex items-center gap-2 text-[0.8125rem] text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function PulseTileBadge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('col-start-2 row-start-1', className)} {...props} />;
}

export function PulseTileValue({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-tile-value
      className={cn(
        'col-span-2 mt-1.5 font-mono text-3xl leading-[1.1] font-medium tracking-[-0.02em] max-sm:text-[1.75rem]',
        '[&_small]:text-base [&_small]:font-medium [&_small]:tracking-normal [&_small]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function PulseTileSub({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('col-span-2 mt-1 text-[0.8125rem] text-muted-foreground', className)}
      {...props}
    />
  );
}

export function PulseTileMeter({
  percent,
  className,
  fillClassName,
}: {
  percent: number;
  className?: string;
  fillClassName?: string;
}) {
  return (
    <span
      className={cn('col-span-2 mt-3 block h-1.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <span
        className={cn('bl-meter-fill block h-full rounded-full bg-warn', fillClassName)}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

export function PulseTileSpark({ values, className }: { values: number[]; className?: string }) {
  return (
    <span className={cn('col-span-2 mt-3 flex h-7 items-end gap-[3px]', className)}>
      {values.map((v, i) => (
        <span
          key={i}
          className="bl-spark flex-1 rounded-t-sm bg-chart-3"
          style={{ height: `${v}%`, animationDelay: `${Math.min(i * 30, 330)}ms` }}
        />
      ))}
    </span>
  );
}
