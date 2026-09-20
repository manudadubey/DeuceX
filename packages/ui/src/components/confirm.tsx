import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

// `.confirm` (Baseline §Feedback and overlays): the mandatory consequence sentence (M-GATE-2)
// sits beside the controls, not behind a second dialog.
export function Confirm({
  title,
  description,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-lg bg-surface p-3.5 text-[0.8125rem]',
        'shadow-[0_0_0_1px_var(--border)] max-sm:grid-cols-1',
        className,
      )}
      {...props}
    >
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-muted-foreground">{description}</div>
      <div className="row-span-2 flex gap-2 max-sm:row-span-1 max-sm:[&>*]:flex-1">{actions}</div>
    </div>
  );
}
