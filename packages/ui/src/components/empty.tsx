import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

// `.empty` (Baseline §Fields "Empty state"): never blank, always says what would fill it.
export function Empty({
  icon,
  title,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { icon?: ReactNode; title: ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="grid size-10 place-items-center rounded-md bg-muted text-foreground">
          {icon}
        </div>
      ) : null}
      <div className="font-medium text-foreground">{title}</div>
      {children}
    </div>
  );
}
