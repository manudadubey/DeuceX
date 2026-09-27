import type { ReactNode } from 'react';

// The prototype's `.agent-h` (docs/deucex-dashboard.html): a 32px icon tile,
// the agent's name over one status line, and an optional badge pushed right.
// Shared by the dashboard's three agent cards.
export function AgentHeader({
  icon,
  title,
  sub,
  badge,
}: {
  icon: ReactNode;
  title: string;
  sub: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-6 max-sm:px-5">
      <div
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-md bg-muted [&_svg]:size-4"
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-tight font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      {badge ? <div className="ml-auto shrink-0">{badge}</div> : null}
    </div>
  );
}
