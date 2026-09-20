const svgNS = 'http://www.w3.org/2000/svg';

/**
 * `el()` from Baseline §Charts: hand-draws an SVG element. Charts are redrawn into a host
 * `<div>` on mount and on resize (never animating on a resize redraw — see `tagChartEnter`),
 * rather than declared as JSX, so a currency or data change can rebuild the whole chart in one
 * pass without diffing.
 */
export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(svgNS, tag);
  for (const key in attrs) {
    node.setAttribute(key, String(attrs[key]));
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

/**
 * Tags a freshly drawn chart's marks with the `bl-*` enter-motion classes (Baseline's chart
 * motion rules): lines draw in, bars grow from the baseline with a stagger, areas and point
 * markers fade in after. Call once per host after appending a new `<svg>`; a later call with
 * the same `dataKey` (e.g. an unchanged viewBox after a resize) is a no-op, not a replay.
 */
export function tagChartEnter(svg: SVGSVGElement, host: HTMLElement, dataKey: string): void {
  if (host.dataset.blDone === '1' && host.dataset.blKey === dataKey) return;
  host.dataset.blKey = dataKey;
  host.dataset.blDone = '1';
  let bar = 0;
  svg.querySelectorAll('path, rect, circle, polyline, polygon').forEach((node) => {
    const tag = node.tagName.toLowerCase();
    const fill = node.getAttribute('fill') ?? '';
    const stroke = node.getAttribute('stroke') ?? '';
    if (tag === 'path' || tag === 'polyline' || tag === 'polygon') {
      if ((fill === 'none' || !fill) && stroke) {
        node.setAttribute('pathLength', '1');
        node.classList.add('bl-line');
      } else if (fill && fill !== 'none') {
        node.classList.add('bl-area');
      }
    } else if (tag === 'rect') {
      const h = Number(node.getAttribute('height')) || 0;
      const w = Number(node.getAttribute('width')) || 0;
      if (fill.includes('var(--') && !fill.includes('grid') && h > 0 && w > 0 && w < 80) {
        node.classList.add('bl-bar');
        (node as SVGElement).style.animationDelay = `${Math.min(bar * 25, 400)}ms`;
        bar += 1;
      }
    } else if (tag === 'circle') {
      node.classList.add('bl-mark');
    }
  });
}
