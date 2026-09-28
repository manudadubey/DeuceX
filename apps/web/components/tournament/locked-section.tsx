import { Badge } from '@deucex/ui';
import { StartTrialButton } from '@/components/billing/start-trial-button';

// M-TIER-1 / decisions worksheet 14: "Free sees the shortlist and the full
// Conditions brief; cost, outcomes, runway effect and the entry controls are
// locked with one sentence naming what Pro adds and a single Start Pro
// trial action." Unlike the Financial Agent's all-or-nothing page dim
// (financial-client.tsx), the Tournament Agent's lock is scoped to one
// region of the detail panel — the shortlist rows and the why paragraph
// stay live on Free.
//
// `quiet` dims a second locked region of the same panel without repeating the
// badge and trial button, so the panel keeps one Start Pro trial action.
export function LockedSection({
  onToast,
  label = 'Pro shows cost, outcomes and runway effect',
  quiet = false,
  children,
}: {
  onToast: (title: string) => void;
  label?: string;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  const dimmed = (
    <div className="pointer-events-none select-none opacity-40 blur-[1px]">{children}</div>
  );
  if (quiet) return <div aria-hidden="true">{dimmed}</div>;
  return (
    <div className="relative">
      {dimmed}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-card/60 p-4 text-center">
        <Badge variant="secondary">{label}</Badge>
        <StartTrialButton size="sm" onToast={onToast} />
      </div>
    </div>
  );
}
