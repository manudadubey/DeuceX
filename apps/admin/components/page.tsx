import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants, cn } from '@deucex/ui';

// The page title row every player-app page uses (h1 + one-line description
// on the left, actions on the right), shared by every console page.
export function PageHeader({
  title,
  description,
  note,
  actions,
}: {
  title: ReactNode;
  description: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {note ? <p className="mt-1.5 text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** The two-column card grids the prototype uses (`.g2`, `.g-ov`). */
export function Grid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1', className)}>
      {children}
    </div>
  );
}

/** The privacy line (`.privacy`): what the console never shows. */
export function PrivacyNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-muted px-3.5 py-2.5 text-[0.8125rem] text-muted-foreground">
      {children}
    </div>
  );
}

/** A Next link styled as a Baseline button (the shared Button has no asChild). */
export function LinkButton({
  href,
  variant = 'outline',
  size = 'sm',
  className,
  children,
}: {
  href: string;
  variant?: 'primary' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), 'no-underline', className)}>
      {children}
    </Link>
  );
}
