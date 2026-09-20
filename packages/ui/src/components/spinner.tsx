import { cn } from '../lib/cn';

// `.spinner` (Baseline §Feedback and overlays), off entirely under reduced motion.
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-foreground',
        'motion-reduce:animate-none',
        className,
      )}
    />
  );
}
