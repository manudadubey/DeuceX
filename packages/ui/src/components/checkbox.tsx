import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

// 18px box, radius 5, filled with --primary when checked: the prototype's `.cb` (recipients,
// focus row, notification matrix). Built on Radix Checkbox for role="checkbox", Space to toggle
// and form participation. Pair it with a <label> or FieldLabel for a 44px mobile target.
export const Checkbox = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer grid size-[1.125rem] shrink-0 cursor-pointer place-items-center rounded-[5px]',
        'border border-input bg-field text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,.05)]',
        'transition-colors duration-150',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check aria-hidden="true" className="size-3" strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
