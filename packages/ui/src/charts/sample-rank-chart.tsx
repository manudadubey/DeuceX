'use client';

import { useEffect, useRef } from 'react';
import { el, tagChartEnter } from './svg';

/**
 * The Baseline §Charts sample: a 52-week ranking line with a dashed projection and two
 * amber points-defence markers. Demonstrates `el()` and the enter-motion tagging; product
 * charts (Tournament Agent, Financial Agent, …) follow the same shape once they exist.
 */
export function SampleRankChart({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    function draw() {
      if (!host) return;
      host.innerHTML = '';
      const width = Math.max(320, host.clientWidth);
      const height = 180;
      const padLeft = 40;
      const padRight = 12;
      const padTop = 14;
      const padBottom = 24;
      const svg = el('svg', {
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label':
          'Sample ranking line: 52 weeks descending from 620 to 512, with a dashed projection to 432 and two amber points-defence markers',
      });
      const points = 52;
      const data = Array.from(
        { length: points },
        (_, i) => 620 - 108 * Math.pow(i / (points - 1), 0.8) + 12 * Math.sin(i / 3),
      );
      const x = (i: number) => padLeft + ((width - padLeft - padRight) * i) / 64;
      const y = (v: number) => padTop + ((height - padTop - padBottom) * (v - 420)) / 220;

      for (const v of [620, 570, 520, 470, 420]) {
        svg.appendChild(
          el('line', {
            x1: padLeft,
            x2: width - padRight,
            y1: y(v),
            y2: y(v),
            stroke: 'var(--chart-grid)',
          }),
        );
        svg.appendChild(el('text', { x: padLeft - 6, y: y(v) + 4, 'text-anchor': 'end' }, `#${v}`));
      }

      const linePath = data
        .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
        .join(' ');
      const baseline = y(420) + (height - padTop - padBottom);
      svg.appendChild(
        el('path', {
          d: `${linePath} L${x(points - 1)} ${baseline} L${x(0)} ${baseline} Z`,
          fill: 'var(--chart-2)',
          opacity: 0.12,
        }),
      );
      svg.appendChild(
        el('path', { d: linePath, fill: 'none', stroke: 'var(--chart-2)', 'stroke-width': 2 }),
      );
      svg.appendChild(
        el('path', {
          d: `M${x(points - 1)} ${y(512)} L${x(58)} ${y(470)} L${x(64)} ${y(432)}`,
          fill: 'none',
          stroke: 'var(--muted-foreground)',
          'stroke-width': 2,
          'stroke-dasharray': '4 4',
        }),
      );
      svg.appendChild(
        el('line', {
          x1: x(points - 1),
          x2: x(points - 1),
          y1: padTop,
          y2: height - padBottom,
          stroke: 'var(--border)',
        }),
      );
      svg.appendChild(
        el(
          'text',
          { x: x(points - 1) - 4, y: height - padBottom - 4, 'text-anchor': 'end' },
          'Today',
        ),
      );
      svg.appendChild(
        el('circle', {
          cx: x(points - 1),
          cy: y(512),
          r: 4,
          fill: 'var(--background)',
          stroke: 'var(--chart-2)',
          'stroke-width': 2,
        }),
      );
      for (const [i, label] of [
        [55, 'Defend 20'],
        [60, 'Defend 10'],
      ] as const) {
        svg.appendChild(el('circle', { cx: x(i), cy: y(455), r: 4, fill: 'var(--warn)' }));
        svg.appendChild(el('text', { x: x(i), y: y(455) - 8, 'text-anchor': 'middle' }, label));
      }
      svg.appendChild(
        el(
          'text',
          { x: x(64), y: y(432) - 8, 'text-anchor': 'end', class: 'font-mono' },
          '~#432 EOY',
        ),
      );

      host.appendChild(svg);
      tagChartEnter(svg, host, String(width));
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return <div ref={hostRef} className={className} style={{ width: '100%', overflow: 'hidden' }} />;
}
