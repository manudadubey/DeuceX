'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  el,
  tagChartEnter,
} from '@deucex/ui';
import type { NoteMood } from '@deucex/db';

// MC-6/section 7's mood scale ("MV" in the prototype): note moods map onto
// the check-in's 1-5 scale; row 3 (unlabelled) is reached only by check-ins.
const MOOD_VALUE: Record<NoteMood, number> = {
  frustrated: 1,
  flat: 2,
  confident: 4,
  energised: 5,
};

export interface MoodChartNote {
  recordedAt: string;
  mood: NoteMood | null;
  result: string | null;
}

export interface MoodChartCheckIn {
  date: string;
  value: number;
}

function localDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso));
}

// "How you've felt, against what happened" (PRD-06 §4.1, MC-6, decisions
// worksheet 17: 30 and 90 day windows, matching the 90-day pattern window).
// Deliberately narrower than the prototype's own drawMood(): no shaded
// tournament weeks or pattern-callout dashed lines, both of which need
// Entered-event and pattern-to-date linkage that don't exist yet (steps 3.2
// and a future pattern/chart cross-reference) — solid dots (notes), hollow
// dots (check-ins) and the W/L row underneath are what's buildable now.
export function MoodChart({
  notes,
  checkins,
  timezone,
  locked,
}: {
  notes: readonly MoodChartNote[];
  checkins: readonly MoodChartCheckIn[];
  timezone: string;
  locked: boolean;
}) {
  const [range, setRange] = useState<30 | 90>(30);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    function draw() {
      if (!host) return;
      host.innerHTML = '';
      const width = Math.max(320, host.clientWidth);
      const narrow = width < 560;
      const height = narrow ? 200 : 240;
      const padLeft = 44;
      const padRight = 12;
      const padTop = 18;
      const padBottom = 40;

      const byDay = new Map<string, { value: number; solid: boolean; result: string | null }>();
      for (const c of checkins) {
        byDay.set(c.date, { value: c.value, solid: false, result: null });
      }
      for (const n of notes) {
        if (!n.mood) continue;
        const day = localDay(n.recordedAt, timezone);
        byDay.set(day, { value: MOOD_VALUE[n.mood], solid: true, result: n.result?.[0] ?? null });
      }

      const days: string[] = [];
      const today = new Date();
      for (let i = range - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d));
      }

      const svg = el('svg', {
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': 'Mood over time against match results',
      });
      svg.setAttribute('style', `height:${height}px`);

      const x = (i: number) =>
        padLeft + (i / Math.max(1, days.length - 1)) * (width - padLeft - padRight);
      const y = (v: number) => padTop + (1 - (v - 1) / 4) * (height - padTop - padBottom);

      const rows: [string, number][] = [
        ['Energised', 5],
        ['Confident', 4],
        ['', 3],
        ['Flat', 2],
        ['Frustrated', 1],
      ];
      for (const [label, v] of rows) {
        svg.appendChild(
          el('line', {
            x1: padLeft,
            x2: width - padRight,
            y1: y(v),
            y2: y(v),
            stroke: 'var(--chart-grid)',
          }),
        );
        if (label && !narrow) {
          svg.appendChild(el('text', { x: padLeft - 8, y: y(v) + 4, 'text-anchor': 'end' }, label));
        }
      }

      const points = days
        .map((day, i) => {
          const entry = byDay.get(day);
          return entry ? { i, ...entry } : null;
        })
        .filter(
          (p): p is { i: number; value: number; solid: boolean; result: string | null } =>
            p !== null,
        );

      let linePath = '';
      points.forEach((p, k) => {
        const px = x(p.i);
        const py = y(p.value);
        if (k === 0) linePath = `M${px},${py}`;
        else {
          const prev = points[k - 1]!;
          const cx = (x(prev.i) + px) / 2;
          linePath += ` C${cx},${y(prev.value)} ${cx},${py} ${px},${py}`;
        }
      });
      if (linePath) {
        svg.appendChild(
          el('path', {
            d: linePath,
            fill: 'none',
            stroke: 'var(--muted-foreground)',
            'stroke-width': 1.5,
            opacity: 0.6,
          }),
        );
      }

      const colorFor = (v: number) =>
        v >= 5
          ? 'var(--chart-2)'
          : v >= 4
            ? 'var(--ok)'
            : v >= 3
              ? 'var(--muted-foreground)'
              : v >= 2
                ? 'var(--muted-foreground)'
                : 'var(--warn)';

      for (const p of points) {
        svg.appendChild(
          el('circle', {
            cx: x(p.i),
            cy: y(p.value),
            r: p.solid ? 5 : 3.5,
            fill: p.solid ? colorFor(p.value) : 'var(--card)',
            stroke: colorFor(p.value),
            'stroke-width': 2,
          }),
        );
        if (p.result === 'W' || p.result === 'L') {
          svg.appendChild(
            el(
              'text',
              {
                x: x(p.i),
                y: height - padBottom + 16,
                'text-anchor': 'middle',
                class: 'font-mono',
                'font-weight': 600,
                fill: p.result === 'W' ? 'var(--ok)' : 'var(--danger)',
              },
              p.result,
            ),
          );
        }
      }

      svg.appendChild(
        el('text', { x: padLeft - 8, y: height - padBottom + 16, 'text-anchor': 'end' }, 'Result'),
      );
      host.appendChild(svg);
      tagChartEnter(svg, host, `${range}-${width}`);
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    return () => observer.disconnect();
  }, [notes, checkins, timezone, range]);

  return (
    <Card className={locked ? 'opacity-50' : undefined}>
      <CardHeader>
        <CardTitle>How you&apos;ve felt, against what happened</CardTitle>
        <CardDescription>
          Mood from your notes and check-ins. Wins and losses along the bottom.
        </CardDescription>
        <Tabs value={String(range)} onValueChange={(v) => setRange(Number(v) as 30 | 90)}>
          <TabsList>
            <TabsTrigger value="30">30 days</TabsTrigger>
            <TabsTrigger value="90">90 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <div ref={hostRef} className="px-6" style={{ width: '100%', overflow: 'hidden' }} />
      <div className="flex flex-wrap items-center gap-3 px-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <i
            className="inline-block size-2 rounded-full"
            style={{ background: 'var(--chart-2)' }}
          />
          Energised
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block size-2 rounded-full" style={{ background: 'var(--ok)' }} />
          Confident
        </span>
        <span className="flex items-center gap-1">
          <i
            className="inline-block size-2 rounded-full"
            style={{ background: 'var(--muted-foreground)' }}
          />
          Flat
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block size-2 rounded-full" style={{ background: 'var(--warn)' }} />
          Frustrated
        </span>
      </div>
    </Card>
  );
}
