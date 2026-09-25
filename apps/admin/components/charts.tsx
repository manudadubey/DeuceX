// Small SVG charts drawn to Baseline §Charts: one y-axis, faint grid,
// 4px-radius bars with a 2px gap, 2px lines, colour from chart tokens, and
// an aria-label that states the claim. Server-renderable (no effects).

interface BarDatum {
  label: string;
  value: number;
  /** Optional second series drawn in the danger colour on top (failures). */
  alt?: number;
}

export function BarChart({
  data,
  ariaLabel,
  height = 160,
  valueFormat = (v: number) => String(v),
  sqrt = false,
}: {
  data: BarDatum[];
  ariaLabel: string;
  height?: number;
  valueFormat?: (v: number) => string;
  /** Square-root scale, so one busy hour doesn't flatten the rest (PRD-13 section 4.4's runs chart). */
  sqrt?: boolean;
}) {
  const width = 600;
  const padLeft = 36;
  const padBottom = 20;
  const padTop = 8;
  const scale = (v: number) => (sqrt ? Math.sqrt(v) : v);
  const max = Math.max(1, ...data.map((d) => scale(d.value + (d.alt ?? 0))));
  const plotH = height - padBottom - padTop;
  const step = (width - padLeft) / Math.max(1, data.length);
  const barW = Math.max(2, step - 2);
  const y = (v: number) => padTop + plotH - (plotH * scale(v)) / max;
  const ticks = [0, 0.5, 1].map((t) => (sqrt ? Math.pow(max * t, 2) : max * t));
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="h-auto w-full"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={padLeft}
            x2={width}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--foreground)"
            strokeOpacity={0.07}
          />
          <text
            x={padLeft - 6}
            y={y(t) + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--muted-foreground)"
            className="font-mono"
          >
            {valueFormat(Math.round(t))}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padLeft + i * step + 1;
        const total = d.value + (d.alt ?? 0);
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={x}
              width={barW}
              y={y(total)}
              height={Math.max(0, padTop + plotH - y(total))}
              rx={4}
              fill="var(--chart-3)"
            >
              <title>{`${d.label}: ${valueFormat(d.value)}${d.alt ? `, ${d.alt} failed` : ''}`}</title>
            </rect>
            {d.alt ? (
              <rect
                x={x}
                width={barW}
                y={y(total)}
                height={Math.max(0, y(d.value) - y(total))}
                rx={4}
                fill="var(--destructive)"
              />
            ) : null}
            {i % labelEvery === 0 ? (
              <text
                x={x + barW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--muted-foreground)"
              >
                {d.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({
  data,
  cap,
  ariaLabel,
  height = 160,
  valueFormat = (v: number) => String(v),
}: {
  data: Array<{ label: string; value: number | null }>;
  cap?: number;
  ariaLabel: string;
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  const width = 600;
  const padLeft = 44;
  const padRight = 12;
  const padBottom = 20;
  const padTop = 10;
  const values = data.map((d) => d.value ?? 0);
  const max = Math.max(cap ?? 0, ...values, 1) * 1.1;
  const plotH = height - padBottom - padTop;
  const x = (i: number) =>
    padLeft + ((width - padLeft - padRight) * i) / Math.max(1, data.length - 1);
  const y = (v: number) => padTop + plotH - (plotH * v) / max;
  const points = data
    .map((d, i) => (d.value === null ? null : `${x(i)},${y(d.value)}`))
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="h-auto w-full"
    >
      {[0, max / 2, max].map((t) => (
        <g key={t}>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--foreground)"
            strokeOpacity={0.07}
          />
          <text
            x={padLeft - 6}
            y={y(t) + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--muted-foreground)"
            className="font-mono"
          >
            {valueFormat(t)}
          </text>
        </g>
      ))}
      {cap !== undefined ? (
        <line
          x1={padLeft}
          x2={width - padRight}
          y1={y(cap)}
          y2={y(cap)}
          stroke="var(--destructive)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      ) : null}
      {points ? (
        <polyline points={points} fill="none" stroke="var(--chart-2)" strokeWidth={2} />
      ) : null}
      {data.map((d, i) =>
        d.value === null ? null : (
          <circle key={d.label} cx={x(i)} cy={y(d.value)} r={3} fill="var(--chart-2)">
            <title>{`${d.label}: ${valueFormat(d.value)}`}</title>
          </circle>
        ),
      )}
      {data.map((d, i) => (
        <text
          key={`l-${d.label}`}
          x={x(i)}
          y={height - 6}
          textAnchor="middle"
          fontSize={10}
          fill="var(--muted-foreground)"
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}

export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string; dashed?: boolean }>;
}) {
  return (
    <span className="flex items-center gap-3 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <i
            className="inline-block h-2 w-3 rounded-sm"
            style={
              item.dashed
                ? { borderTop: `2px dashed ${item.color}`, height: 0 }
                : { background: item.color }
            }
          />
          {item.label}
        </span>
      ))}
    </span>
  );
}
