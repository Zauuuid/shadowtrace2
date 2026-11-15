/**
 * Journey maths without Three.js: selenographic vectors, the Horizons Sun at JOURNEY_DATE, and where the Moon sits on
 * screen for each opening page. The same layout places the CSS poster (first paint) and the WebGL Moon, so the
 * hand-over has no jump.
 */
import type { EphemerisFile } from '../planner/ephemeris';

export type Vec3 = [number, number, number];
const D = Math.PI / 180;

/**
 * Unit vector of (lat, east lon) in the Moon frame used by the scene. It matches Three.js SphereGeometry UVs with an
 * equirectangular map centred on 0° longitude: +X = (0°, 0°), +Y = north pole, −Z = 90° E.
 */
export function lonLatToVec3(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * D, lo = lonDeg * D;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

/** Rotation that turns point (lat, lon) toward +Z with north up: R = Rx(lat) · Ry(−90° − lon). Applied to v. */
export function faceRotate(v: Vec3, latDeg: number, lonDeg: number): Vec3 {
  const a = (-90 - lonDeg) * D, b = latDeg * D;
  const x1 = v[0] * Math.cos(a) + v[2] * Math.sin(a), z1 = -v[0] * Math.sin(a) + v[2] * Math.cos(a);
  return [x1, v[1] * Math.cos(b) - z1 * Math.sin(b), v[1] * Math.sin(b) + z1 * Math.cos(b)];
}

/** Lighting date of the Journey. */
export const JOURNEY_DATE = '2027-01-27T04:00:00Z';
/**
 * Sub-solar point at JOURNEY_DATE from the NASA JPL Horizons table (public/data/ephemeris.json, row 2092). Stored here
 * so the opening pages never download the 4 MB ephemeris; journey.test.ts checks it against the file.
 */
export const JOURNEY_SUN = { lat: -0.34568, lon: -55.05442 } as const;

/** Sub-solar and sub-Earth unit vectors at a time, linearly interpolated between the hourly Horizons rows. */
export function bodyDirs(f: EphemerisFile, iso: string): { sun: Vec3; earth: Vec3 } {
  const t0 = Date.parse(f.startUtc.endsWith('Z') ? f.startUtc : `${f.startUtc}Z`);
  const x = (Date.parse(iso) - t0) / (f.stepHours * 3_600_000);
  const i = Math.max(0, Math.min(f.count - 2, Math.floor(x)));
  const w = x - i;
  const lerpLon = (a: number, b: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * w;
  const sun = lonLatToVec3(f.sunLat[i]! * (1 - w) + f.sunLat[i + 1]! * w, lerpLon(f.sunLon[i]!, f.sunLon[i + 1]!));
  const earth = lonLatToVec3(f.earthLat[i]! * (1 - w) + f.earthLat[i + 1]! * w, lerpLon(f.earthLon[i]!, f.earthLon[i + 1]!));
  return { sun, earth };
}

/** Where the disc sits (px) and which point of the Moon faces the viewer, for one page. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  /** Disc diameter (px). */
  readonly d: number;
  readonly lat: number;
  readonly lon: number;
  /** Top of the visible area (px): the solid navbar on portrait phones, 0 otherwise. */
  readonly top: number;
}

export function isPortrait(w: number, h: number): boolean {
  return h > w * 1.05;
}

/**
 * Page 0: the Moon on the end side (right in LTR, left in RTL), about 70 % of the disc visible, never taller than the
 * screen; lit from the screen edge so the text side stays dark. Page 1: same size, turned to show the south pole.
 * Portrait phones: the Moon centred in the upper half, lit from above; the text sits below it.
 */
export function poseFor(page: 0 | 1, w: number, h: number, rtl: boolean): Pose {
  const s = JOURNEY_SUN.lon;
  if (isPortrait(w, h)) {
    // The navbar is a solid bar on portrait phones; the disc is cut by its lower edge.
    const d = Math.min(1.2 * w, 0.56 * h);
    const nav = w <= 640 ? 56 : 64;
    const sideCut = Math.max(0, (d - w) / 2) / d;
    const topCut = 0.35 - 1.2 * sideCut;
    return { x: w / 2, y: nav + (0.5 - topCut) * d, d, top: nav, lat: page === 0 ? -35 : -66, lon: page === 0 ? s - 15 : s - 30 };
  }
  const d = Math.min(0.92 * h, 0.62 * w);
  const x = rtl ? 0.2 * d : w - 0.2 * d;
  const side = rtl ? 1 : -1;
  return { x, y: h * 0.5, d, top: 0, lat: page === 0 ? -8 : -52, lon: s + side * (page === 0 ? 50 : 45) };
}

/** Direction of the Sun on screen (x right, y up, z toward the viewer) for a pose at rest. */
export function sunOnScreen(p: Pick<Pose, 'lat' | 'lon'>): Vec3 {
  return faceRotate(lonLatToVec3(JOURNEY_SUN.lat, JOURNEY_SUN.lon), p.lat, p.lon);
}

/** Smooth step used for page changes (both the CSS and the WebGL Moon). */
export function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Self-rotation speed (degrees of longitude per second), independent of scroll. */
export const SPIN_DEG_S = 0.8;
/** Page change duration (ms). */
export const PAGE_MS = 650;
