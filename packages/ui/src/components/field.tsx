import { type HTMLAttributes, type LabelHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// `.field` / `.label` / `.desc` (Baseline §Fields).
export function Field({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'text-sm leading-none font-medium [&_small]:font-normal [&_small]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[0.8125rem] text-muted-foreground', className)} {...props} />;
}

export function FieldGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}
