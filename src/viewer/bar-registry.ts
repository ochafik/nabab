/**
 * Geometry of every rendered outcome bar, recorded by graph-render.ts on each
 * render so overlays (hover preview, MPE highlight) and hit-testing can work
 * on the existing SVG without re-rendering it. All coordinates are local to
 * the node group (origin at the node centre).
 */
import type * as d3 from 'd3';

export interface BarGeom {
  outcome: string;
  idx: number;
  /** Displayed value of the bar (evidence weight when observed, else posterior). */
  val: number;
  /** x of the thumb at 0% and extent to 100% (thumbMin, thumbRange). */
  x0: number;
  range: number;
  /** Bar track rect. */
  bx: number;
  bw: number;
  by: number;
  barH: number;
  /** Label hit area (x range) for the multi-outcome layout, null for the single-slider layout. */
  labelX: [number, number] | null;
  /** Outcome not drawn (behind "+k more"): zero-size placeholder that keeps `bars[idx]` aligned; never hit. */
  hidden?: boolean;
}

export interface NodeGeom {
  name: string;
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  /** Node centre in graph space (kept in sync while dragging). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** y of the header row. */
  headerY: number;
  bars: BarGeom[];
}

export const registry = new Map<string, NodeGeom>();

export type HitZone = 'bar' | 'label';

export interface Hit {
  node: NodeGeom;
  bar: BarGeom;
  zone: HitZone;
  /** Horizontal fraction along the bar in [0, 1] (0 at the thumb's 0% position). */
  fraction: number;
}

/** Find the bar or label under a point in node-local coordinates. */
export function hitTestNode(node: NodeGeom, x: number, y: number): Hit | null {
  for (const bar of node.bars) {
    if (bar.hidden) continue;
    if (y < bar.by - 5 || y > bar.by + bar.barH + 5) continue;
    if (x >= bar.bx - 4 && x <= bar.bx + bar.bw + 4) {
      return { node, bar, zone: 'bar', fraction: Math.max(0, Math.min(1, (x - bar.x0) / bar.range)) };
    }
    if (bar.labelX && x >= bar.labelX[0] && x <= bar.labelX[1]) {
      return { node, bar, zone: 'label', fraction: 1 };
    }
  }
  return null;
}
