'use client';

import { useEffect, useRef } from 'react';
import { axisK, el, tagChartEnter } from '@procircuit/ui';

export interface RunwayChartProps {
  /** 14 weekly balances, cash only. */
  cashOnly: readonly number[];
  /** Same 14 weeks, with pending receivables added in their expected week (F-6: never counted toward reserves/runway, shown only as this dashed line). */
  withPending: readonly number[];
  currency: string;
}

// PRD-03 §4.1's runway chart, deliberately narrower than the prototype's
// own drawRunway(): no scenario tabs (no Tournament Agent top pick exists
// until step 3.2, so the control collapses to No entry per PRD-03's own
// failure-behaviour text) and no 10/4-week burn bands. Solid line is cash
// only; dashed is cash-with-pending (F-6: never counts toward the reserves
// or runway tiles, shown only as this second line).
export function RunwayChart({ cashOnly, withPending, currency }: RunwayChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    function draw() {
      if (!host) return;
      host.innerHTML = '';
      const width = Math.max(280, host.clientWidth);
      const height = 200;
      const padLeft = 44;
      const padRight = 12;
      const padTop = 16;
      const padBottom = 24;

      const allValues = [...cashOnly, ...withPending, 0];
      const maxValue = Math.max(1, ...allValues);

      const plotWidth = width - padLeft - padRight;
      const plotHeight = height - padTop - padBottom;
      const stepX = plotWidth / Math.max(1, cashOnly.length - 1);

      const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height });

      const y = (v: number) => padTop + plotHeight - (v / maxValue) * plotHeight;
      const x = (i: number) => padLeft + i * stepX;

      // Y-axis ticks.
      for (const frac of [0, 0.5, 1]) {
        const value = maxValue * frac;
        const yPos = y(value);
        svg.append(
          el('line', {
            x1: padLeft,
            x2: width - padRight,
            y1: yPos,
            y2: yPos,
            stroke: 'var(--border)',
            'stroke-width': 1,
          }),
        );
        svg.append(
          el(
            'text',
            { x: 4, y: yPos + 4, fill: 'var(--muted-foreground)', 'font-size': 11 },
            axisK(value),
          ),
        );
      }

      const cashPoints = cashOnly.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      svg.append(
        el('polyline', {
          points: cashPoints,
          fill: 'none',
          stroke: 'var(--chart-1)',
          'stroke-width': 2,
        }),
      );

      const pendingPoints = withPending.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      svg.append(
        el('polyline', {
          points: pendingPoints,
          fill: 'none',
          stroke: 'var(--chart-3)',
          'stroke-width': 2,
          'stroke-dasharray': '4 4',
        }),
      );

      host.append(svg);
      tagChartEnter(svg, host, `${cashOnly.join(',')}|${withPending.join(',')}|${currency}`);
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    return () => observer.disconnect();
  }, [cashOnly, withPending, currency]);

  return <div ref={hostRef} className="w-full" />;
}
