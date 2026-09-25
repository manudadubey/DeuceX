import { Badge, Button } from '@deucex/ui';

// M-TIER-1 / decisions worksheet 14: "Free sees the shortlist and the full
// Conditions brief; cost, outcomes, runway effect and the entry controls are
// locked with one sentence naming what Pro adds and a single Start Pro
// trial action." Unlike the Financial Agent's all-or-nothing page dim
// (financial-client.tsx), the Tournament Agent's lock is scoped to one
// region of the detail panel — the shortlist rows and the why paragraph
// stay live on Free.
export function LockedSection({
  onStartTrial,
  label = 'Pro shows cost, outcomes and runway effect',
  children,
}: {
  onStartTrial: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-40 blur-[1px]">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-card/60 p-4 text-center">
        <Badge variant="secondary">{label}</Badge>
        <Button size="sm" onClick={onStartTrial}>
          Start Pro trial
        </Button>
      </div>
    </div>
  );
}
