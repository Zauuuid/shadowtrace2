import type { Reason } from '../planner/mission';

/** The site on its own (step 3): Sun, Earth and battery only. Slope is judged later, with the error margin (step 4). */
export function siteStatus(reasons: readonly Reason[], insufficient: boolean): { status: 'good' | 'warn' | 'insufficient'; reasons: Reason[] } {
  if (insufficient) return { status: 'insufficient', reasons: [] };
  const r = reasons.filter((x) => x.code !== 'slope');
  return { status: r.length ? 'warn' : 'good', reasons: r };
}
