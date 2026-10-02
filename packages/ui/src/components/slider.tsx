import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../lib/cn';

// The prototype's range input (`.budget input[type="range"]`, accent --foreground), built on
// Radix Slider for arrow, Page and Home/End keys and a consistent look in every browser.
// The thumb grows to a 44px hit area under 900px.
export const Slider = forwardRef<
  ElementRef<typeof SliderPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(function Slider(
  { className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props },
  ref,
) {
  const thumbs = (props.value ?? props.defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex h-5 w-full touch-none items-center select-none max-[900px]:h-11',
        'data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-foreground" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          // The thumb is what takes focus, so the slider's name goes on it.
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          className={cn(
            'block size-4 rounded-full border border-foreground bg-background shadow-[0_1px_3px_rgba(0,0,0,.2)]',
            'transition-[box-shadow]',
            'max-[900px]:size-6',
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
});
