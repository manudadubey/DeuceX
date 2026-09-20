import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

// `.textarea` (Baseline §Fields): same field recipe as Input, min-height 120px, resizes vertically.
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[7.5rem] w-full resize-y rounded-md border border-input bg-field px-2.5 py-2 text-sm',
        'leading-[1.55] text-foreground shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none',
        'placeholder:text-muted-foreground focus:border-ring focus:shadow-[var(--shadow-ring-field)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
