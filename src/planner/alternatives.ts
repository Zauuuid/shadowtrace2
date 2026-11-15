/**
 * Nearby alternative sites when a plan fails (same dates, same spacecraft, same landing ellipse).
 *
 * Only fully suitable sites are returned: a candidate must pass every rule the main verdict uses — Sun and battery,
 * Earth contact, and slope inside the user's landing ellipse. Candidates are taken on rings around the chosen site
 * (searchRings, nearest first, up to 100 km) and filtered cheaply before the full simulation:
 *   1. the monthly Sun & Earth screening raster (optional `screen` callback; red cells are skipped);
 *   2. the slope at the aim point (the aim point is inside the ellipse, so a steep aim point always fails);
 *   3. a quick simulation (2° horizon, 30-minute steps);
 * then every survivor is re-checked at full resolution (40 m tiles, 1° horizon, the same step as the main analysis)
 * before it is accepted. The search stops at `want` sites, nearest first. When nothing passes, the reason is the most
 * common failure among the candidates that were evaluated.
 */
import type { Ephemeris } from './ephemeris';
import { computeHorizon } from './horizon';
import { analyseZone, slopeAt, type Dispersion } from './landing';
import { hours, powerCommsReasons, simulate, stepMinutesFor, type Limits, type Reason, type Spacecraft } from './mission';
import { distanceAz, offset, toLatLon, toXY, type LatLon, type XY } from './polar';
import type { PolarTerrain } from './terrain';

export interface SiteAlternative {
  readonly site: LatLon;
  readonly distanceM: number;
  readonly azDeg: number;
  readonly darkH: number;
  readonly blackoutH: number;
  readonly slopeDeg: number;
}

/** Why nothing was found: the dominant failure (battery, Earth blackout, slope), or 'light' when the screening raster
 *  rejected everything (long nights or no Earth for these dates). */
export type AltReason = 'battery' | 'blackout' | 'slope' | 'light';

export interface SiteSearch {
  readonly sites: readonly SiteAlternative[];
  /** Null while sites were found; otherwise why none passed. */
  readonly reason: AltReason | null;
}

export interface SearchOptions {
  readonly dispersion: Dispersion;
  readonly want?: number;
  readonly signal?: AbortSignal;
  /** Called after every ring with the suitable sites found so far (nearest first). */
  readonly onProgress?: (sites: readonly SiteAlternative[]) => void;
  /** Cheap pre-filter (e.g. the Sun & Earth screening raster): false = not promising, skip. */
  readonly screen?: (site: LatLon) => boolean;
  /**
   * Promising points (e.g. the centres of the green and amber cells of the screening raster), used instead of the
   * rings. They are tried nearest first; each is moved to the highest LOLA point within `refineM`, because on the
   * pole the high ground is the best lit.
   */
  readonly candidates?: readonly LatLon[];
  readonly refineM?: number;
  /** Upper bound on full evaluations (keeps the worst case to a few tens of seconds). */
  readonly maxEvaluations?: number;
}

/** Highest LOLA point in a square of half-width `halfM` around q (7 × 7 samples). */
function highest(t: PolarTerrain, q: XY, halfM: number): XY {
  let best = q, bh = t.heightAt(q);
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const p = { x: q.x + (i * halfM) / 3, y: q.y + (j * halfM) / 3 };
    const hh = t.heightAt(p);
    if (Number.isFinite(hh) && (!Number.isFinite(bh) || hh > bh)) { bh = hh; best = p; }
  }
  return best;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * The search covers this radius around the chosen site, automatically (owner's request: 2,000 km). The LOLA terrain
 * stops at 75° S, so the whole mapped cap (≈ 910 km across) is always inside it: in practice the whole map is searched,
 * nearest first. Candidates outside the terrain coverage are skipped.
 */
export const ALT_RADIUS_KM = 2000;
const RINGS_KM = [0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 30, 40, 55, 70, 85, 100, 125, 150, 180, 215, 255, 300, 350, 405, 465, 530, 600, 675, 755, 840, 930, 1025];

/** Ring radii (km) up to `radiusKm`: dense near the site, sparser far away (spacing never shrinks). */
export function searchRings(radiusKm: number): number[] {
  const r = RINGS_KM.filter((x) => x < radiusKm - 1e-9);
  if (radiusKm <= RINGS_KM[RINGS_KM.length - 1]!) r.push(radiusKm);
  return r;
}

/** Every rule of the verdict for one aim point. Returns the failing rules (empty = suitable). */
export function checkSite(
  eph: Ephemeris, t: PolarTerrain, q: XY, startMs: number, endMs: number, sc: Spacecraft, lim: Limits, d: Dispersion,
  horizonStepDeg: number, stepMin: number,
): { reasons: Reason[]; darkH: number; blackoutH: number; slopeDeg: number } | null {
  const gridM = t.hasDetail(q) ? 40 : 240;
  const site = toLatLon(q);
  const hz = computeHorizon(t, q, sc.mastM, horizonStepDeg);
  const res = simulate(eph, hz, site, startMs, endMs, sc, lim, stepMin);
  if ('kind' in res) return null;
  const reasons: Reason[] = powerCommsReasons(res, lim);
  const zone = analyseZone(t, q, d, lim.legSpanM, lim.maxSlopeDeg, gridM);
  if (zone.samples === 0) return null;
  if (zone.maxSlopeDeg > lim.maxSlopeDeg) reasons.push({ code: 'slope', slopeDeg: zone.maxSlopeDeg, maxDeg: lim.maxSlopeDeg });
  return { reasons, darkH: hours(res.longestDark), blackoutH: hours(res.longestBlackout), slopeDeg: zone.maxSlopeDeg };
}

export async function searchSites(
  eph: Ephemeris, t: PolarTerrain, center: LatLon, radiusKm: number, startMs: number, endMs: number,
  sc: Spacecraft, lim: Limits, opts: SearchOptions,
): Promise<SiteSearch> {
  const want = opts.want ?? 3;
  const c = toXY(center);
  // 40 m detail only near the site; farther candidates use the 240 m grid (loading all tiles would be ~70 MB).
  await t.ensureDetail(c, Math.min(radiusKm, 20) * 1000 + 13_000);
  const quickStep = Math.max(30, stepMinutesFor(endMs - startMs));
  const fullStep = stepMinutesFor(endMs - startMs);
  const found: SiteAlternative[] = [];
  const fails = { battery: 0, blackout: 0, slope: 0 };
  let evaluated = 0;
  const done = (): SiteSearch => {
    if (found.length) return { sites: [...found].sort((a, b) => a.distanceM - b.distanceM), reason: null };
    const top = (Object.entries(fails) as [keyof typeof fails, number][]).sort((a, b) => b[1] - a[1])[0]!;
    return { sites: [], reason: evaluated === 0 || top[1] === 0 ? 'light' : top[0] };
  };
  const maxEval = opts.maxEvaluations ?? Infinity;
  const tried: XY[] = [];
  /** Evaluates one aim point; true when the search should stop. */
  const tryPoint = async (q: XY, dedupe = false): Promise<boolean> => {
    if (opts.signal?.aborted || evaluated >= maxEval) return true;
    const site = toLatLon(q);
    if (!t.covers(q) || distanceAz(center, site).m > radiusKm * 1000) return false;
    if (opts.screen && !opts.screen(site)) return false;
    // raster cells: never two aim points closer than 1.5 km (neighbours share the same light and horizon)
    if (dedupe) {
      if (tried.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 1500)) return false;
      tried.push(q);
    }
    await tick(); // yield before the expensive part only
    if (opts.signal?.aborted) return true;
    const baseline = Math.max(lim.legSpanM, 2 * (t.hasDetail(q) ? 40 : 240));
    const aimSlope = slopeAt(t, q, baseline);
    if (!Number.isFinite(aimSlope)) return false;
    evaluated++;
    if (aimSlope > lim.maxSlopeDeg) { fails.slope++; return false; }
    const quick = checkSite(eph, t, q, startMs, endMs, sc, lim, opts.dispersion, 2, quickStep);
    if (!quick) return false;
    if (quick.reasons.length) { for (const x of quick.reasons) fails[x.code]++; return false; }
    // Full-resolution check, exactly as the main analysis will judge this site once it is applied.
    await t.ensureDetail(q, 13_000);
    if (opts.signal?.aborted) return true;
    const full = checkSite(eph, t, q, startMs, endMs, sc, lim, opts.dispersion, 1, fullStep);
    if (!full) return false;
    if (full.reasons.length) { for (const x of full.reasons) fails[x.code]++; return false; }
    const da = distanceAz(center, site);
    found.push({ site, distanceM: da.m, azDeg: da.az, darkH: full.darkH, blackoutH: full.blackoutH, slopeDeg: full.slopeDeg });
    return found.length >= want;
  };

  const ringSearch = async (maxKm: number) => {
    const rings = searchRings(maxKm);
    for (let ri = 0; ri < rings.length && found.length < want; ri++) {
      const r = rings[ri]!;
      const spacing = r - (rings[ri - 1] ?? 0);
      const nAz = Math.max(8, Math.min(r > 100 ? 48 : 24, Math.round((2 * Math.PI * r) / spacing)));
      for (let k = 0; k < nAz; k++) if (await tryPoint(offset(c, (360 * k) / nAz, r * 1000))) return true;
      opts.onProgress?.(done().sites);
    }
    return false;
  };

  if (opts.candidates) {
    // close by first (a small move often fixes a slope), then the promising cells of the whole map, nearest first
    if (await ringSearch(Math.min(radiusKm, 7.5))) return done();
    const list = opts.candidates.map((s) => ({ q: toXY(s), d: distanceAz(center, s).m })).sort((a, b) => a.d - b.d);
    for (let i = 0; i < list.length; i++) {
      const q = opts.refineM ? highest(t, list[i]!.q, opts.refineM) : list[i]!.q;
      if (found.length >= want || await tryPoint(q, true)) break;
      if (i % 12 === 11) opts.onProgress?.(done().sites);
    }
    opts.onProgress?.(done().sites);
    return done();
  }

  await ringSearch(radiusKm);
  return done();
}
