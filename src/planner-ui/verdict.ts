/** Verdict sentences: one per failed rule, or the "all good" sentence. Durations in plain words, never clock times. */
import type { Analysis } from '../hooks/useAnalysis';
import type { Reason } from '../planner/mission';
import { fmtDuration, fmtNum, type T } from '../i18n';
import type { Lang } from '../state/store';

export function reasonSentence(t: T, lang: Lang, r: Reason): string {
  if (r.code === 'battery') return t('reason.battery', { d: fmtDuration(lang, r.darkH), b: fmtDuration(lang, r.batteryH) });
  if (r.code === 'blackout') return t('reason.blackout', { h: fmtDuration(lang, r.blackoutH), m: fmtDuration(lang, r.maxH) });
  return t('reason.slope', { s: fmtNum(lang, r.slopeDeg, 1), m: fmtNum(lang, r.maxDeg) });
}

export function verdictSentences(t: T, a: Analysis, lang: Lang = 'en'): string[] {
  if ('kind' in a.mission) {
    const c = a.mission.code;
    return [t(c === 'no-ephemeris' ? 'reason.noEph' : c === 'no-terrain' ? 'reason.noTerrain' : 'reason.badDates')];
  }
  if (a.reasons.length) return a.reasons.map((r) => reasonSentence(t, lang, r));
  return [t('verdict.ok')];
}
