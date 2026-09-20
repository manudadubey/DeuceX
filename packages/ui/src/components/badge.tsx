import { type HTMLAttributes, forwardRef } from 'react';
import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from '../lib/cn';

// 20px pill, 12px text. Ported from Baseline §Badges, chips, stamps.
export const badgeVariants = cva(
  'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border border-border px-2 text-xs font-medium leading-none text-foreground',
  {
    variants: {
      variant: {
        default: '',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        ok: 'border-transparent bg-ok-bg text-ok',
        warn: 'border-transparent bg-warn-bg text-warn',
        danger: 'border-transparent bg-danger-bg text-danger',
        lime: 'border-transparent bg-chart-2/16 text-chart-2',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, ...props },
  ref,
) {
  return <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
});

export function BadgeDot({ className }: { className?: string }) {
  return <span className={cn('size-1.5 rounded-full bg-current', className)} />;
}
