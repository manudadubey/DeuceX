'use client';

import { useEffect, useRef } from 'react';
import { el, tagChartEnter } from '@procircuit/ui';
import { formatPatronMoney } from '@procircuit/agents';

// PRD-04 section 4.1's two charts, ported from the prototype's drawFans() and
// drawMRR(): hand-drawn with el() into a host div and redrawn on resize,
// same as runway-chart.tsx.

function useChart(draw: (host: HTMLDivElement) => void, deps: unknown[]) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const run = () => draw(host);
    run();
    const observer = new ResizeObserver(run);
    observer.observe(host);
    return () => observer.disconnect();
  }, deps);
  return hostRef;
}

export interface MovementDay {
  date: string;
  joins: string[];
  leaves: string[];
}

function shortDay(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** "Joins and departures as people, not numbers." Joins above the axis, departures below. */
export function MovementChart({
  days,
  joined,
  left,
  updateDates = [],
}: {
  days: readonly MovementDay[];
  joined: number;
  left: number;
  /** ISO dates of published updates (PRD-05, step 4.2), drawn as dashed lines. */
  updateDates?: readonly string[];
}) {
  const key = JSON.stringify([days, joined, left, updateDates]);
  const hostRef = useChart(
    (host) => {
      host.innerHTML = '';
      const W = Math.max(300, Math.round(host.clientWidth || 700));
      const H = 150;
      const pl = 56;
      const pr = 8;
      const pt = 26;
      const pb = 22;
      const n = days.length;
      const svg = el('svg', {
        viewBox: `0 0 ${W} ${H}`,
        width: W,
        height: H,
        role: 'img',
        'aria-label': `Patron joins and departures over the last 30 days: ${joined} joined, ${left} left`,
      });
      svg.style.fontSize = '11px';
      const bw = (W - pl - pr) / n;
      const mid = pt + (H - pt - pb) * 0.6;
      const uh = (H - pt - pb) * 0.6 - 8;
      const dh = (H - pt - pb) * 0.4 - 6;
      svg.append(el('line', { x1: pl, x2: W - pr, y1: mid, y2: mid, stroke: 'var(--border)' }));
      const updates = new Set(updateDates);
      days.forEach((d, i) => {
        const cx = pl + i * bw + bw / 2;
        svg.append(
          el('rect', { x: cx - 1, y: mid - 1, width: 2, height: 2, fill: 'var(--chart-grid)' }),
        );
        if (updates.has(d.date)) {
          svg.append(
            el('line', {
              x1: cx,
              x2: cx,
              y1: pt,
              y2: H - pb,
              stroke: 'var(--muted-foreground)',
              'stroke-dasharray': '2 3',
            }),
          );
        }
        if (d.joins.length) {
          const stagger = days[i - 1]?.joins.length ? 12 : 0;
          svg.append(
            el('rect', {
              x: cx - bw * 0.3,
              y: mid - uh,
              width: bw * 0.6,
              height: uh,
              rx: 3,
              fill: 'var(--chart-2)',
            }),
          );
          svg.append(
            el(
              'text',
              {
                x: cx + (stagger ? bw * 0.4 : -bw * 0.1),
                y: mid - uh - 4 - stagger,
                'text-anchor': stagger ? 'start' : 'end',
                fill: 'var(--foreground)',
              },
              d.joins.join(', '),
            ),
          );
        }
        if (d.leaves.length) {
          svg.append(
            el('rect', {
              x: cx - bw * 0.3,
              y: mid + 1,
              width: bw * 0.6,
              height: dh,
              rx: 3,
              fill: 'var(--danger)',
            }),
          );
          svg.append(
            el(
              'text',
              { x: cx + bw * 0.5, y: mid + dh + 2, fill: 'var(--danger)' },
              d.leaves.join(', '),
            ),
          );
        }
      });
      svg.append(
        el(
          'text',
          { x: pl - 8, y: mid - uh + 10, 'text-anchor': 'end', fill: 'var(--chart-2)' },
          `${joined} joined`,
        ),
      );
      svg.append(
        el(
          'text',
          { x: pl - 8, y: mid + dh, 'text-anchor': 'end', fill: 'var(--danger)' },
          `${left} left`,
        ),
      );
      if (days[0])
        svg.append(
          el('text', { x: pl, y: H - 6, fill: 'var(--muted-foreground)' }, shortDay(days[0].date)),
        );
      svg.append(
        el(
          'text',
          { x: W - pr, y: H - 6, 'text-anchor': 'end', fill: 'var(--muted-foreground)' },
          'Today',
        ),
      );
      host.append(svg);
      tagChartEnter(svg, host, key);
    },
    [key],
  );
  return <div ref={hostRef} className="w-full" />;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Shown last on purpose. Six months, gross, before fees." */
export function MrrChart({
  history,
  currency,
}: {
  history: ReadonlyArray<{ month: string; gross: number }>;
  currency: string;
}) {
  const key = JSON.stringify([history, currency]);
  const hostRef = useChart(
    (host) => {
      host.innerHTML = '';
      const W = Math.max(300, Math.round(host.clientWidth || 600));
      const H = 180;
      const pl = 44;
      const pr = 8;
      const pt = 18;
      const pb = 24;
      const svg = el('svg', {
        viewBox: `0 0 ${W} ${H}`,
        width: W,
        height: H,
        role: 'img',
        'aria-label': `Monthly recurring revenue, six months: ${history.map((m) => `${MONTHS[Number(m.month.slice(5)) - 1]} ${formatPatronMoney(m.gross, currency)}`).join(', ')}`,
      });
      svg.style.fontSize = '11px';
      const top = Math.max(100, ...history.map((m) => m.gross));
      const step = top > 2000 ? 1000 : top > 600 ? 200 : 100;
      const maxV = Math.ceil((top * 1.1) / step) * step;
      const y = (v: number) => pt + (1 - v / maxV) * (H - pt - pb);
      const gw = (W - pl - pr) / Math.max(1, history.length);
      const bw = Math.min(40, gw * 0.5);
      for (let v = 0; v <= maxV; v += step) {
        svg.append(
          el('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), stroke: 'var(--chart-grid)' }),
        );
        svg.append(
          el(
            'text',
            {
              x: pl - 8,
              y: y(v) + 4,
              'text-anchor': 'end',
              fill: 'var(--muted-foreground)',
              class: 'font-mono',
            },
            String(v),
          ),
        );
      }
      history.forEach((m, i) => {
        const last = i === history.length - 1;
        const cx = pl + gw * i + gw / 2;
        if (m.gross > 0) {
          svg.append(
            el('rect', {
              x: cx - bw / 2,
              y: y(m.gross),
              width: bw,
              height: y(0) - y(m.gross),
              rx: 4,
              fill: last ? 'var(--chart-2)' : 'var(--chart-4)',
            }),
          );
        }
        svg.append(
          el(
            'text',
            {
              x: cx,
              y: y(m.gross) - 6,
              'text-anchor': 'middle',
              class: 'font-mono',
              fill: last ? 'var(--foreground)' : 'var(--muted-foreground)',
            },
            formatPatronMoney(m.gross, currency),
          ),
        );
        svg.append(
          el(
            'text',
            { x: cx, y: H - 6, 'text-anchor': 'middle', fill: 'var(--muted-foreground)' },
            MONTHS[Number(m.month.slice(5)) - 1] ?? '',
          ),
        );
      });
      host.append(svg);
      tagChartEnter(svg, host, key);
    },
    [key],
  );
  return <div ref={hostRef} className="w-full" />;
}
