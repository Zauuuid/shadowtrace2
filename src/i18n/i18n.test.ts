import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ar } from './ar';
import { en } from './en';
import { fmtDate, fmtDuration, fmtNum } from './index';

/** Phrases that must never appear in the UI (MASTER-PROMPT §2). */
const BANNED = [/demo/i, /placeholder/i, /best site/i, /signal strength/i, /link quality/i, /safe landing guaranteed/i,
  /NASA approved/i, /success probability/i, /line of sight/i, /خط نظر/, /قيم تجريبية/];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('bilingual strings', () => {
  it('every English key has an Arabic key and the reverse; no empty strings', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    for (const v of [...Object.values(en), ...Object.values(ar)]) expect(v.trim().length).toBeGreaterThan(0);
  });
  it('the same placeholders in both languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(ar[k]), k).toBe(ph(en[k]));
  });
  it('no banned phrase, no Sun or Earth percentage', () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(ar)]) {
      for (const re of BANNED) expect(re.test(v), `${k}: ${v}`).toBe(false);
      expect(/(sun|earth|الشمس|الأرض)[^.]*%/i.test(v), k).toBe(false);
    }
  });
  it('no literal user-facing text inside components', () => {
    const offenders: string[] = [];
    for (const f of tsxFiles('src')) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // JSX text between tags, e.g. <b>Battery</b>
      for (const m of src.matchAll(/>([^<>{}]*[A-Za-z؀-ۿ]{2,}[^<>{}]*)</g)) {
        const text = m[1]!.trim();
        if (text && !/(&&|\|\||\?|=>|[=;()])/.test(text)) offenders.push(`${f}: ${text}`);
      }
      // literal strings in attributes people read or hear
      for (const m of src.matchAll(/\b(aria-label|title|placeholder|alt|aria-valuetext)="([^"]*[A-Za-z؀-ۿ][^"]*)"/g)) offenders.push(`${f}: ${m[1]}="${m[2]}"`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('formatting', () => {
  const d = Date.parse('2027-01-14T12:00:00Z');
  it('dates never show hours; Western digits in both languages; Gregorian calendar in Arabic', () => {
    expect(fmtDate('en', d, 'utc')).toBe('14 Jan 2027');
    expect(fmtDate('ar', d, 'utc')).toMatch(/14.*يناير.*2027/);
    expect(fmtDate('ar', d, 'utc')).not.toMatch(/[٠-٩]|:/);
  });
  it('numbers and durations', () => {
    expect(fmtNum('en', 2320)).toBe('2,320');
    expect(fmtNum('ar', 2320)).not.toMatch(/[٠-٩]/);
    expect(fmtDuration('en', 19.7)).toBe('20 hours');
    expect(fmtDuration('en', 5.25)).toBe('5.3 hours');
    expect(fmtDuration('en', 168)).toBe('7 days');
    expect(fmtDuration('ar', 72)).toBe('3 أيام');
  });
});
