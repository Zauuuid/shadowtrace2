import { describe, expect, it } from 'vitest';
import { clamp, parseNumber } from './number';
import { outageRows } from './outages';

describe('number input helpers', () => {
  it('parses separators and Arabic-Indic digits', () => {
    expect(parseNumber('5,505,050')).toBe(5505050);
    expect(parseNumber('٢٣٢٠')).toBe(2320);
    expect(parseNumber('2٬320')).toBe(2320);
    expect(parseNumber(' 12.5 ')).toBe(12.5);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('1e9')).toBeNull();
  });
  it('clamps and says so', () => {
    expect(clamp(5505050, 0, 500000)).toEqual({ value: 500000, clamped: true });
    expect(clamp(-3, 0, 10)).toEqual({ value: 0, clamped: true });
    expect(clamp(7, 0, 10)).toEqual({ value: 7, clamped: false });
  });
});

describe('outage rows', () => {
  const runs = Array.from({ length: 9 }, (_, i) => ({ startMs: i * 1e7, endMs: i * 1e7 + (9 - i) * 3.6e6 }));
  it('shows at most max rows and counts the rest', () => {
    const r = outageRows(runs, 6);
    expect(r.rows).toHaveLength(6);
    expect(r.more).toBe(3);
    expect(r.rows[0]).toEqual(runs[0]);
  });
  it('rows are in time order', () => {
    const r = outageRows([...runs].reverse(), 4);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i]!.startMs).toBeGreaterThan(r.rows[i - 1]!.startMs);
  });
  it('empty input', () => {
    expect(outageRows([], 6)).toEqual({ rows: [], more: 0 });
  });
});

describe('chart tick spacing', () => {
  it('picks days, weeks, months or years by length', async () => {
    const { tickPlan } = await import('./format');
    expect(tickPlan(10)).toEqual({ unit: 'day', every: 1 });
    expect(tickPlan(30)).toEqual({ unit: 'day', every: 2 });
    expect(tickPlan(100)).toEqual({ unit: 'day', every: 7 });
    expect(tickPlan(300)).toEqual({ unit: 'month', every: 1 });
    expect(tickPlan(1000)).toEqual({ unit: 'month', every: 3 });
    expect(tickPlan(3300)).toEqual({ unit: 'year', every: 1 });
  });
});

describe('site status (no slope)', () => {
  it('ignores slope and warns on Sun/Earth/battery problems', async () => {
    const { siteStatus } = await import('./tones');
    expect(siteStatus([{ code: 'slope', slopeDeg: 22, maxDeg: 10 }], false)).toEqual({ status: 'good', reasons: [] });
    const b = { code: 'blackout' as const, blackoutH: 300, maxH: 72, count: 2 };
    expect(siteStatus([{ code: 'slope', slopeDeg: 22, maxDeg: 10 }, b], false)).toEqual({ status: 'warn', reasons: [b] });
    expect(siteStatus([], true).status).toBe('insufficient');
  });
});

describe('language on first open', () => {
  it('route first, then the saved choice, then the browser language, else English', async () => {
    const { pickLang, routeLang, LANG_KEY } = await import('./lang');
    expect(LANG_KEY).not.toBe('st-lang');
    expect(pickLang('ar', 'en', ['en-US'])).toBe('ar');
    expect(pickLang(null, 'en', ['ar-SA'])).toBe('en');
    expect(pickLang(null, null, ['ar-SA', 'en'])).toBe('ar');
    expect(pickLang(null, 'garbage', ['fr-FR'])).toBe('en');
    expect(pickLang(null, null, [])).toBe('en');
    expect(routeLang('#/ar')).toBe('ar');
    expect(routeLang('#m=abc')).toBeNull();
  });
});
