/** Pure fit-to-viewport math for the graph view. */

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 4;
export const MAX_FIT_ZOOM = 1.5;

export interface Box { minX: number; minY: number; maxX: number; maxY: number }
export interface Fit { x: number; y: number; k: number }

/** Bounding box of centred rectangles; null when there are none. */
export function boundsOf(items: Iterable<{ x: number; y: number; w: number; h: number }>): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y, w, h } of items) {
    minX = Math.min(minX, x - w / 2); maxX = Math.max(maxX, x + w / 2);
    minY = Math.min(minY, y - h / 2); maxY = Math.max(maxY, y + h / 2);
  }
  return minX <= maxX ? { minX, minY, maxX, maxY } : null;
}

/** Transform that centres `box` in a W x H viewport, zoom clamped to [MIN_ZOOM, MAX_FIT_ZOOM]. */
export function computeFit(box: Box, W: number, H: number, pad = 30): Fit {
  const bw = Math.max(1, box.maxX - box.minX + pad * 2);
  const bh = Math.max(1, box.maxY - box.minY + pad * 2);
  const k = Math.max(MIN_ZOOM, Math.min(W / bw, H / bh, MAX_FIT_ZOOM));
  return { k, x: W / 2 - (box.minX + box.maxX) / 2 * k, y: H / 2 - (box.minY + box.maxY) / 2 * k };
}
