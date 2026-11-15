/**
 * Strings and formatting. Text comes only from en.ts / ar.ts (full sentence templates with {placeholders});
 * numbers, dates and durations go through Intl. Western digits in both languages (ar-SA-u-nu-latn), Gregorian
 * calendar, dates without hours.
 */
import { usePlanner, type Lang, type Tz } from '../state/store';
import { ar } from './ar';
import { en, type Key } from './en';

export type { Key };
export const DICT: Record<Lang, Record<Key, string>> = { en, ar };

const LOCALE: Record<Lang, string> = { en: 'en-GB', ar: 'ar-SA-u-ca-gregory-nu-latn' };
const ZONE: Record<Tz, string> = { utc: 'UTC', ksa: 'Asia/Riyadh' };

export type Vars = Record<string, string | number>;
export type T = (k: Key, vars?: Vars) => string;

export function translate(lang: Lang, k: Key, vars?: Vars): string {
  const s = DICT[lang][k];
  return vars ? s.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? '')) : s;
}

export function useT(): T {
  const lang = usePlanner((s) => s.lang);
  return (k, vars) => translate(lang, k, vars);
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${lang}${JSON.stringify(opts)}`;
  let f = nfCache.get(key);
  if (!f) { f = new Intl.NumberFormat(LOCALE[lang], opts); nfCache.set(key, f); }
  return f;
}

export function fmtNum(lang: Lang, n: number, digits = 0): string {
  return nf(lang, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

/** "14 Jan 2027" / "14 يناير 2027". Never hours. */
export function fmtDate(lang: Lang, ms: number, tz: Tz): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: lang === 'en' ? 'short' : 'long', year: 'numeric', timeZone: ZONE[tz] }).format(ms);
}

/** Day and month only, for chart ticks. */
export function fmtDayMonth(lang: Lang, ms: number, tz: Tz): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', timeZone: ZONE[tz] }).format(ms);
}

export function fmtMonth(lang: Lang, ms: number, tz: Tz, withYear: boolean): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { month: lang === 'en' ? 'short' : 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: ZONE[tz] }).format(ms);
}

export function fmtYear(lang: Lang, ms: number): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric', timeZone: 'UTC' }).format(ms);
}

/** Calendar parts of an instant in the chosen time zone. */
export function dayParts(ms: number, tz: Tz): { y: number; m: number; d: number } {
  const d = new Date(ms + (tz === 'ksa' ? 3 * 3_600_000 : 0));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

export function monthNames(lang: Lang): string[] {
  const f = new Intl.DateTimeFormat(LOCALE[lang], { month: 'long', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, m) => f.format(Date.UTC(2027, m, 15)));
}

export function weekdayInitials(lang: Lang): string[] {
  const f = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'narrow', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, k) => f.format(Date.UTC(2027, 0, 3 + k))); // 3 Jan 2027 is a Sunday
}

/** A duration in plain words: hours below two days, days above ("20 hours", "5.5 days", "11 يومًا"). */
export function fmtDuration(lang: Lang, hours: number): string {
  if (hours < 48) {
    const v = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
    return nf(lang, { style: 'unit', unit: 'hour', unitDisplay: 'long', maximumFractionDigits: 1 }).format(v);
  }
  const d = hours / 24;
  const v = d < 10 ? Math.round(d * 10) / 10 : Math.round(d);
  return nf(lang, { style: 'unit', unit: 'day', unitDisplay: 'long', maximumFractionDigits: 1 }).format(v);
}

export function fmtKm(lang: Lang, m: number): string {
  return m < 1000 ? translate(lang, 'unit.m', { n: fmtNum(lang, m) }) : translate(lang, 'unit.km', { n: fmtNum(lang, m / 1000, m < 10_000 ? 1 : 0) });
}

export function dirName(lang: Lang, azDeg: number): string {
  return translate(lang, `dir.${Math.round((((azDeg % 360) + 360) % 360) / 45) % 8}` as Key);
}

/** Coordinates are always shown left-to-right, in an isolate, with Western digits. */
export function fmtLatLon(lat: number, lon: number, digits = 4): string {
  return `${lat.toFixed(digits)}°, ${lon.toFixed(digits)}°`;
}

export function locale(lang: Lang): string {
  return LOCALE[lang];
}

/** Names that are the same in every language: the brand and each language's own name on the toggle. */
export const BRAND = 'ShadowTrace';
export const LANG_NAMES: Record<Lang, string> = { en: 'EN', ar: 'عربي' };
