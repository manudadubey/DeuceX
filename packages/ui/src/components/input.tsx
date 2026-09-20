import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

// `.input` (Baseline §Fields): field background, 8px radius, ring focus.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-field px-2.5 text-sm text-foreground',
          'shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none placeholder:text-muted-foreground',
          'focus:border-ring focus:shadow-[var(--shadow-ring-field)]',
          'disabled:cursor-not-allowed disabled:opacity-50 max-[900px]:min-h-11',
          className,
        )}
        {...props}
      />
    );
  },
);
