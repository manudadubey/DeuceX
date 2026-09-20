import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from '../lib/cn';

// 36px tall, radius 8px (--radius-md), weight 500. Ported from Baseline §Buttons.
// The 44px mobile target rule (Baseline §Accessibility) applies under 900px, Baseline's
// own sidebar-collapse breakpoint, not Tailwind's default `sm`.
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
    'border border-transparent transition-[transform,background-color,box-shadow,opacity] duration-150',
    'active:scale-[0.97] active:duration-[120ms] disabled:pointer-events-none disabled:opacity-50',
    'max-[900px]:min-h-11',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        outline:
          'bg-field text-foreground border-input shadow-[0_1px_2px_rgba(0,0,0,.05)] hover:bg-accent hover:opacity-100',
        secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
        ghost: 'bg-transparent text-foreground hover:bg-accent',
        destructive: 'bg-destructive text-white hover:opacity-90',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 rounded-sm px-3 text-[0.8125rem]',
        icon: 'h-9 w-9 px-0',
        'icon-sm': 'h-8 w-8 rounded-sm px-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  const dataAttrs = variant === 'outline' ? { 'data-bl-outline': '' } : {};
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...dataAttrs}
      {...props}
    />
  );
});
