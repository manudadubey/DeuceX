import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

// Radius 14px (--radius-xl), no border, hairline ring via box-shadow, 24px padding.
// Ported from Baseline §Cards and tiles.
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-bl-card=""
      className={cn(
        'flex scroll-mt-[4.5rem] flex-col gap-6 rounded-xl bg-card py-6 text-card-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)]',
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 px-6 max-sm:grid-cols-1',
          className,
        )}
        {...props}
      />
    );
  },
);

export const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <p
        ref={ref}
        className={cn('col-start-1 row-start-1 text-balance text-base/6 font-medium', className)}
        {...props}
      />
    );
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn('col-start-1 row-start-2 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
});

export const CardActions = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardActions({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'col-start-2 row-span-2 row-start-1 flex items-start gap-2 self-start max-sm:col-start-1 max-sm:row-start-3',
          className,
        )}
        {...props}
      />
    );
  },
);

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('px-6', className)} {...props} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-wrap items-center gap-2 border-t border-border px-6 pt-6',
          className,
        )}
        {...props}
      />
    );
  },
);
