// PRD-08 section 4.1: the racquet visual `.rq`, `clipPath` `rqHeadT`, mains
// in chart-2 and crosses in chart-4 — markup ported verbatim from
// docs/procircuit-dashboard.html's own `<svg viewBox="0 0 150 190">`
// (PROCIRCUIT-CONTEXT.md 5.4), just with hard-coded colours swapped for the
// Baseline tokens the rest of apps/web already uses.
const MAINS_X = [31, 37, 43, 49, 55, 61, 67, 73, 79, 85, 91, 97, 103, 109, 115];
const CROSSES_Y = [8, 14, 20, 26, 32, 38, 44, 50, 56, 62, 68, 74, 80, 86, 92, 98, 104, 110, 116];

export function RacquetVisual() {
  return (
    <svg viewBox="0 0 150 190" aria-hidden="true" className="h-[190px] w-[150px] shrink-0">
      <defs>
        <clipPath id="rqHeadT">
          <ellipse cx="75" cy="62" rx="50" ry="58" />
        </clipPath>
      </defs>
      <g clipPath="url(#rqHeadT)">
        {MAINS_X.map((x) => (
          <line
            key={`mains-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={124}
            stroke="var(--chart-2)"
            strokeWidth={1.1}
            opacity={0.85}
          />
        ))}
        {CROSSES_Y.map((y) => (
          <line
            key={`crosses-${y}`}
            x1={20}
            y1={y}
            x2={130}
            y2={y}
            stroke="var(--chart-4)"
            strokeWidth={1.1}
            opacity={0.85}
          />
        ))}
      </g>
      <ellipse
        cx="75"
        cy="62"
        rx="50"
        ry="58"
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={6}
      />
      <path
        d="M52 112 L68 140 M98 112 L82 140"
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <rect x="66" y="138" width="18" height="46" rx="4" fill="var(--muted-foreground)" />
    </svg>
  );
}
