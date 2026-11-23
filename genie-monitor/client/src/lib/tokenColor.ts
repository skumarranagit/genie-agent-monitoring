/**
 * Resolve a semantic CSS token (e.g. `--success`, authored in oklch) to an `rgb()` string.
 * ECharts/zrender can't parse oklch or var(), so we rasterise one pixel on a canvas and read it back.
 */
export function resolveTokenColor(token: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!raw) return fallback;
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = raw; // ignored by the browser if unparseable → fallback stays
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}
