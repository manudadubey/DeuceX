import { type HTMLAttributes, type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

// `.igroup` (Baseline §Fields): a leading icon/prefix plus a borderless inner input.
export const InputGroup = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function InputGroup({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex h-9 items-center gap-2 rounded-md border border-input bg-field px-2.5 text-muted-foreground',
          'has-[input:focus]:border-ring max-[900px]:min-h-11',
          className,
        )}
        {...props}
      />
    );
  },
);

export const InputGroupInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function InputGroupInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none',
          'placeholder:text-muted-foreground',
          className,
        )}
        {...props}
      />
    );
  },
);
