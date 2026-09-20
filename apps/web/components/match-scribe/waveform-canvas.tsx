'use client';

import { useEffect, useRef } from 'react';

// `#wave` (Baseline / prototype): bars, 3px wide with 2px gaps, drawn from
// the recorder's real mic levels while recording, a faint flat line at rest.
export function WaveformCanvas({ levels, active }: { levels: number[]; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 300;
    const height = 56;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const barWidth = 3;
    const gap = 2;
    const barCount = Math.floor(width / (barWidth + gap));
    const style = getComputedStyle(document.documentElement);
    const color = style.getPropertyValue(active ? '--destructive' : '--muted-foreground');

    for (let i = 0; i < barCount; i++) {
      const level = levels[levels.length - barCount + i] ?? 0.04;
      const barHeight = Math.max(3, level * (height - 8));
      ctx.fillStyle = color;
      ctx.globalAlpha = active ? 1 : 0.35;
      ctx.fillRect(i * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;
  }, [levels, active]);

  return <canvas ref={canvasRef} aria-hidden="true" className="block h-14 w-full" />;
}
