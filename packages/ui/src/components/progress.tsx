import { cn } from '../lib/cn';

// `.progress` (Baseline §Feedback and overlays): grows from its origin on mount, then
// transitions smoothly on later updates.
export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="bl-meter-fill h-full rounded-full bg-primary transition-[width] duration-[250ms] ease-linear"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
