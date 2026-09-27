'use client';

import { useEffect, useRef } from 'react';
import { el, tagChartEnter } from '@deucex/ui';

export interface RankChartPoint {
  /** ISO date of the snapshot's week_start. */
  week: string;
  rank: number;
}

export interface RankChartDefence {
  /** ISO date of the week the points drop off. */
  week: string;
  points: number;
  label: string | null;
}

export interface RankChartProps {
  points: readonly RankChartPoint[];
  defences: readonly RankChartDefence[];
  /** ISO date for the Today line. */
  today: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PAST_WEEKS = 52;
const FUTURE_WEEKS = 10;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The prototype's `drawRank()` (docs/deucex-dashboard.html) drawn from the
// player's real ranking_snapshots: 52 weeks of history to the Today line,
// then ten weeks ahead where points-defence markers sit. There's no
// projection line: no forecast run exists to draw one from, so the chart
// doesn't imply one.
export function RankChart({ points, defences, today }: RankChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    function draw() {
      if (!host) return;
      host.innerHTML = '';
      const W = Math.max(320, Math.round(host.clientWidth || 760));
      const narrow = W < 560;
      const H = narrow ? 220 : 260;
      const pl = 40;
      const pr = 12;
      const pt = 40;
      const pb = 28;

      const todayMs = Date.parse(today);
      const start = todayMs - PAST_WEEKS * WEEK_MS;
      const end = todayMs + FUTURE_WEEKS * WEEK_MS;
      const x = (ms: number) => pl + ((ms - start) / (end - start)) * (W - pl - pr);

      const ranks = points.map((p) => p.rank);
      const step = 50;
      const lo = Math.max(1, Math.floor((Math.min(...ranks) - 10) / step) * step);
      const hi = Math.max(lo + step * 2, Math.ceil((Math.max(...ranks) + 10) / step) * step);
      const y = (v: number) => pt + ((v - lo) / (hi - lo)) * (H - pt - pb);

      const svg = el('svg', {
        viewBox: `0 0 ${W} ${H}`,
        role: 'img',
        'aria-label': `52-week ranking trajectory, now #${ranks[ranks.length - 1]}, with points defence markers`,
      });
      svg.style.height = `${H}px`;

      const tickCount = Math.min(5, Math.round((hi - lo) / step) + 1);
      for (let k = 0; k < tickCount; k++) {
        const v = Math.round(lo + ((hi - lo) * k) / (tickCount - 1));
        svg.appendChild(
          el('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), stroke: 'var(--chart-grid)' }),
        );
        svg.appendChild(
          el('text', { x: pl - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'font-mono' }, `#${v}`),
        );
      }

      // Month labels every second month (every fourth on narrow widths).
      const first = new Date(start);
      const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
      let n = 0;
      while (cursor.getTime() < end) {
        if (n % (narrow ? 4 : 2) === 0) {
          svg.appendChild(
            el(
              'text',
              { x: x(cursor.getTime()), y: H - 8, 'text-anchor': 'middle' },
              MONTHS[cursor.getUTCMonth()] ?? '',
            ),
          );
        }
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        n++;
      }

      const tx = x(todayMs);
      svg.appendChild(
        el('line', {
          x1: tx,
          x2: tx,
          y1: pt,
          y2: H - pb,
          stroke: 'var(--border)',
          'stroke-dasharray': '2 3',
        }),
      );
      svg.appendChild(el('text', { x: tx - 6, y: H - pb - 6, 'text-anchor': 'end' }, 'Today'));

      const xy = points.map((p) => `${x(Date.parse(p.week))},${y(p.rank)}`).join(' ');
      const firstX = x(Date.parse(points[0]!.week));
      const lastPoint = points[points.length - 1]!;
      const lastX = x(Date.parse(lastPoint.week));
      if (points.length > 1) {
        const gid = 'gRankArea';
        const defs = el('defs');
        const g = el('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 });
        g.appendChild(
          el('stop', { offset: '0', 'stop-color': 'var(--chart-2)', 'stop-opacity': '.28' }),
        );
        g.appendChild(
          el('stop', { offset: '1', 'stop-color': 'var(--chart-2)', 'stop-opacity': '0' }),
        );
        defs.appendChild(g);
        svg.appendChild(defs);
        svg.appendChild(
          el('polygon', {
            points: `${firstX},${H - pb} ${xy} ${lastX},${H - pb}`,
            fill: `url(#${gid})`,
          }),
        );
        svg.appendChild(
          el('polyline', {
            points: xy,
            fill: 'none',
            stroke: 'var(--chart-2)',
            'stroke-width': 2,
            'stroke-linejoin': 'round',
          }),
        );
      }

      // Points defence: last year's points dropping off in the weeks ahead.
      // Marked at the current rank level, since that's what the points hold up.
      defences.forEach((d, i) => {
        const mx = x(Date.parse(d.week));
        const my = y(lastPoint.rank);
        const lift = 22 + i * 30;
        const text = narrow
          ? `Def. ${d.points}`
          : `Defend ${d.points}${d.label ? ` · ${d.label}` : ''}`;
        svg.appendChild(
          el('line', { x1: mx, x2: mx, y1: my, y2: my - lift, stroke: 'var(--warn)' }),
        );
        svg.appendChild(
          el('circle', {
            cx: mx,
            cy: my,
            r: 4.5,
            fill: 'var(--warn)',
            stroke: 'var(--card)',
            'stroke-width': 2,
          }),
        );
        svg.appendChild(
          el(
            'text',
            { x: mx - 4, y: my - lift - 5, 'text-anchor': 'end', fill: 'var(--foreground)' },
            text,
          ),
        );
      });

      svg.appendChild(
        el('circle', {
          cx: lastX,
          cy: y(lastPoint.rank),
          r: 5,
          fill: 'var(--foreground)',
          stroke: 'var(--card)',
          'stroke-width': 2,
        }),
      );
      svg.appendChild(
        el(
          'text',
          {
            x: lastX - 8,
            y: y(lastPoint.rank) + 18,
            'text-anchor': 'end',
            fill: 'var(--foreground)',
            class: 'font-mono',
            'font-weight': 500,
          },
          `#${lastPoint.rank}`,
        ),
      );

      host.appendChild(svg);
      tagChartEnter(svg, host, `${points.length}:${defences.length}:${today}`);
    }

    draw();
    let lastW = host.clientWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - lastW) < 8) return;
      lastW = host.clientWidth;
      draw();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [points, defences, today]);

  return (
    <div
      ref={hostRef}
      className="w-full overflow-hidden [&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:overflow-visible [&_text]:fill-muted-foreground [&_text]:text-[0.6875rem] [&_text[fill]]:fill-foreground"
    />
  );
}
