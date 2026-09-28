// The prototype's "Net outcome range" rail (docs/deucex-dashboard.html,
// .outcome): a muted track, a gradient bar from the early-loss outcome to the
// deep-run one, a thin line at zero, and a marker at the expected outcome.
// The prototype scales every event to a fixed -2,400 to 6,800 window; real
// events vary too much for that, so this scales to the event's own range,
// always keeping zero in view with a little room at each end.

// en-US, as the other Tournament cards do, so AUD reads "A$".
function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function signed(value: number, currency: string): string {
  return `${value >= 0 ? '+' : ''}${formatMoney(value, currency)}`;
}

export function OutcomeRail({
  lo,
  hi,
  exp,
  currency,
  loLabel = 'Early loss',
  hiLabel = 'Deep run',
}: {
  lo: number;
  hi: number;
  exp: number;
  currency: string;
  loLabel?: string;
  hiLabel?: string;
}) {
  const low = Math.min(lo, hi, exp, 0);
  const high = Math.max(lo, hi, exp, 0);
  const pad = (high - low || 1) * 0.12;
  const min = low - pad;
  const max = high + pad;
  const at = (v: number) => `${(((v - min) / (max - min)) * 100).toFixed(1)}%`;
  const width = `${(((Math.max(lo, hi) - Math.min(lo, hi)) / (max - min)) * 100).toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center justify-between text-muted-foreground">
        <span>Net outcome range</span>
        <span>
          Expected <b className="font-mono font-medium text-foreground">{signed(exp, currency)}</b>
        </span>
      </div>
      <div
        role="img"
        aria-label={`${loLabel} ${signed(lo, currency)}, expected ${signed(exp, currency)}, ${hiLabel.toLowerCase()} ${signed(hi, currency)}`}
        className="relative h-7 overflow-hidden rounded-md bg-muted"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-muted-foreground"
          style={{ left: at(0) }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 rounded bg-[linear-gradient(90deg,var(--danger)_0%,var(--warn)_45%,var(--chart-2)_100%)] opacity-85"
          style={{ left: at(Math.min(lo, hi)), width }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 bg-foreground"
          style={{ left: at(exp) }}
        />
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>
          {loLabel} <b className="font-mono font-medium text-foreground">{signed(lo, currency)}</b>
        </span>
        <span>
          {hiLabel} <b className="font-mono font-medium text-foreground">{signed(hi, currency)}</b>
        </span>
      </div>
    </div>
  );
}
