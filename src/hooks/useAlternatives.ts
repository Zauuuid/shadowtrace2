/**
 * Suitable sites near a failing plan (MASTER-PROMPT §8). One search per plan, cached by its inputs, shared by the
 * site step and the result step. The Sun & Earth screening raster of the mission's months picks the promising cells.
 */
import { useEffect, useState } from 'react';
import { ALT_RADIUS_KM, searchSites, type AltReason, type SiteAlternative } from '../planner/alternatives';
import { toLatLon, type LatLon } from '../planner/polar';
import type { PlannerData } from '../data/data';
import { usePlanner } from '../state/store';
import type { Analysis } from './useAnalysis';

export interface Alternatives {
  readonly sites: readonly SiteAlternative[];
  readonly searching: boolean;
  /** Set when the search finished with nothing suitable. */
  readonly reason: AltReason | null;
}

const IDLE: Alternatives = { sites: [], searching: false, reason: null };
const cache = new Map<string, Alternatives>();
const rasters = new Map<string, Promise<ImageData | null>>();

function monthsOf(startMs: number, endMs: number): string[] {
  const out: string[] = [];
  const d = new Date(startMs);
  for (let y = d.getUTCFullYear(), m = d.getUTCMonth(); Date.UTC(y, m, 1) <= endMs && out.length < 12; m++) {
    if (m === 12) { m = 0; y++; }
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
  }
  return out;
}

function raster(month: string): Promise<ImageData | null> {
  let p = rasters.get(month);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true });
        if (!g) return res(null);
        g.drawImage(img, 0, 0);
        res(g.getImageData(0, 0, c.width, c.height));
      };
      img.onerror = () => res(null);
      img.src = `${import.meta.env.BASE_URL}data/suit/${month}.png`;
    });
    rasters.set(month, p);
  }
  return p;
}

/** Raster colours (scripts/prepare_suitability.py): green = Sun and Earth up about half the month on flat ground,
 *  amber = fair, red = long nights, no Earth, or steep. */
function cellClass(d: Uint8ClampedArray, i: number): number {
  if (d[i + 3]! < 16) return -1;
  if (d[i + 1]! > 200) return 2;
  if (d[i + 2]! < 100) return 1;
  return 0;
}

/**
 * Promising aim points from the screening rasters of the mission's months: the centre of every cell that is green or
 * amber in every month. The engine tries them nearest first.
 */
async function rasterCandidates(data: PlannerData, startMs: number, endMs: number): Promise<LatLon[] | undefined> {
  const meta = data.suit;
  if (!meta) return undefined;
  const months = monthsOf(startMs, endMs).filter((m) => meta.months.includes(m));
  const imgs = (await Promise.all(months.map(raster))).filter((x): x is ImageData => !!x);
  if (!imgs.length) return undefined;
  const W = imgs[0]!.width, H = imgs[0]!.height;
  const out: LatLon[] = [];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let worst = 2;
      for (const im of imgs) worst = Math.min(worst, cellClass(im.data, (py * W + px) * 4));
      if (worst >= 1) {
        out.push(toLatLon({ x: ((px + 0.5) / W) * 2 * meta.extentM - meta.extentM, y: meta.extentM - ((py + 0.5) / H) * 2 * meta.extentM }));
      }
    }
  }
  return out;
}

/** `wanted`: search now (site step: the site has a Sun/Earth/battery problem; result step: the plan is not suitable). */
export function useAlternatives(data: PlannerData, a: Analysis | null, busy: boolean, wanted: boolean): Alternatives {
  const site = usePlanner((s) => s.site);
  const startMs = usePlanner((s) => s.startMs);
  const endMs = usePlanner((s) => s.endMs);
  const craft = usePlanner((s) => s.craft);
  const limits = usePlanner((s) => s.limits);
  const dispersion = usePlanner((s) => s.dispersion);
  const on = !busy && !!a && wanted;
  const key = a?.key ?? '';
  const [, bump] = useState(0);

  useEffect(() => {
    if (!on || cache.has(key)) return;
    const ctl = new AbortController();
    cache.set(key, { sites: [], searching: true, reason: null });
    (async () => {
      const candidates = await rasterCandidates(data, startMs, endMs);
      if (ctl.signal.aborted) return;
      const r = await searchSites(data.eph, data.terrain, site, ALT_RADIUS_KM, startMs, endMs, craft, limits, {
        dispersion, want: 3, signal: ctl.signal, candidates, refineM: 1000, maxEvaluations: 600,
        onProgress: (sites) => {
          if (ctl.signal.aborted || !sites.length) return;
          cache.set(key, { sites, searching: true, reason: null });
          bump((n) => n + 1);
        },
      });
      if (ctl.signal.aborted) return;
      cache.set(key, { sites: r.sites, searching: false, reason: r.reason });
      bump((n) => n + 1);
    })();
    return () => { ctl.abort(); if (cache.get(key)?.searching) cache.delete(key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on]);

  return on ? cache.get(key) ?? { ...IDLE, searching: true } : IDLE;
}
