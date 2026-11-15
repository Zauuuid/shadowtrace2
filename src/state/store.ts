import { create } from 'zustand';
import type { Dispersion } from '../planner/landing';
import type { Limits, Spacecraft } from '../planner/mission';
import type { LatLon } from '../planner/polar';
import { decodeMission } from './share';
import { firstLang, type Lang } from './lang';

export type { Lang };
export type Tz = 'utc' | 'ksa';
/** Opening pages: 0 = first hook, 1 = second hook, 2 = the planner. */
export type Page = 0 | 1 | 2;
/** Planner steps: 1 dates · 2 spacecraft · 3 site · 4 landing ellipse · 5 result · 6 report */
export type Step = 1 | 2 | 3 | 4 | 5 | 6;
export const LAST_STEP = 6;

/** Averages of published NASA vehicle specs (Nova-C, Blue Ghost, Peregrine, VIPER). Loads are not published. */
export const DEFAULT_CRAFT: Spacecraft = {
  arrayAreaM2: 1.8, arrayEff: 0.196, batteryWh: 2320, usableFrac: 0.85, dayLoadW: 150, nightLoadW: 100,
  panel: 'tracking', fixedAzDeg: 0, mastM: 2,
};
export const DEFAULT_LIMITS: Limits = { minEarthElDeg: 1, maxBlackoutH: 72, minContactHPerDay: 2, maxSlopeDeg: 10, legSpanM: 4 };

export const DAY = 86_400_000;
// A 14-day window in which the default site works for the default lander (Sun, Earth and battery all pass).
const START = Date.parse('2027-01-08T12:00:00Z');
/** 100 m × 100 m landing ellipse: the NASA Artemis human-lander requirement of landing within 100 m of the target. */
export const DEFAULT_DISPERSION: Dispersion = { northM: 50, eastM: 50, southM: 50, westM: 50 };

interface PlannerState {
  lang: Lang;
  tz: Tz;
  page: Page;
  step: Step;
  site: LatLon;
  dispersion: Dispersion;
  startMs: number;
  endMs: number;
  craft: Spacecraft;
  limits: Limits;
  /** The Sun & Earth colour layer on the site map (off by default). */
  suitLayer: boolean;
  set: (p: Partial<Omit<PlannerState, 'set'>>) => void;
  setCraft: (p: Partial<Spacecraft>) => void;
}

export const usePlanner = create<PlannerState>((set) => ({
  lang: firstLang(),
  tz: 'utc',
  page: 0,
  step: 1,
  // Crest of NASA's "Connecting Ridge" Artemis III candidate region: highest 40 m LOLA cell within 3 km
  site: { lat: -89.4391, lon: -137.1912 },
  dispersion: DEFAULT_DISPERSION,
  startMs: START,
  endMs: START + 14 * DAY,
  craft: DEFAULT_CRAFT,
  limits: DEFAULT_LIMITS,
  suitLayer: false,
  set: (p) => set(p),
  setCraft: (p) => set((s) => ({ craft: { ...s.craft, ...p } })),
}));

/** A shared mission link (#m=…) opens straight on the result. */
function applySharedLink(): void {
  if (typeof location === 'undefined') return;
  const m = decodeMission(location.hash);
  if (!m) return;
  usePlanner.setState({ ...m, page: 2, step: 5 });
  // Drop the mission from the hash so later edits are not overwritten on reload; the language route is set by App.
  history.replaceState(null, '', location.pathname + location.search);
}
applySharedLink();
