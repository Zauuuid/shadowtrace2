import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { analyseLanding } from './landing';
import { azEl, discFractionVisible, makeEphemeris, sunRadiusDeg, type EphemerisFile } from './ephemeris';
import { computeHorizon, horizonAt } from './horizon';
import { hours, powerCommsReasons, simulate, type Limits, type Spacecraft } from './mission';
import { distanceAz, localAxes, offset, toLatLon, toXY, type XY } from './polar';
import { PolarTerrain, type GridMeta, type TileMeta } from './terrain';

const DATA = 'public/data';
const eph = makeEphemeris(JSON.parse(readFileSync(`${DATA}/ephemeris.json`, 'utf8')) as EphemerisFile);

function realTerrain(): PolarTerrain {
  return new PolarTerrain({
    regional: async () => {
      const meta = JSON.parse(readFileSync(`${DATA}/lola_south_240m.json`, 'utf8')) as GridMeta;
      const buf = gunzipSync(readFileSync(`${DATA}/lola_south_240m.bin.gz`));
      return { meta, dn: new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2) };
    },
    tileMeta: async () => JSON.parse(readFileSync(`${DATA}/dem40/meta.json`, 'utf8')) as TileMeta,
    tile: async (r, c) => {
      const b = gunzipSync(readFileSync(`${DATA}/dem40/r${r}_c${c}.bin.gz`));
      return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2);
    },
  });
}

/** Analytic terrain: height = f(east, north) around an origin, flat sphere otherwise. */
function fakeTerrain(origin: XY, f: (eM: number, nM: number) => number): PolarTerrain {
  const { north, east } = localAxes(origin);
  const h = (q: XY) => {
    const dx = q.x - origin.x, dy = q.y - origin.y;
    return f(dx * east.x + dy * east.y, dx * north.x + dy * north.y);
  };
  return { heightAt: h, regionalHeightAt: h, hasDetail: () => true, ensureDetail: async () => {}, covers: () => true } as unknown as PolarTerrain;
}

const SC: Spacecraft = { arrayAreaM2: 1.8, arrayEff: 0.196, batteryWh: 2320, usableFrac: 0.85, dayLoadW: 150, nightLoadW: 100, panel: 'tracking', fixedAzDeg: 0, mastM: 2 };
const LIM: Limits = { minEarthElDeg: 0, maxBlackoutH: 72, minContactHPerDay: 0, maxSlopeDeg: 10, legSpanM: 4 };
const SITE_A = { lat: -89.445, lon: -138.468 };
const DISP = { northM: 50, eastM: 50, southM: 50, westM: 50 };

describe('polar projection', () => {
  it('round-trips and puts lon 0 on +y, lon 90E on +x', () => {
    const p = toLatLon(toXY({ lat: -88.2, lon: 123.4 }));
    expect(p.lat).toBeCloseTo(-88.2, 9);
    expect(p.lon).toBeCloseTo(123.4, 9);
    expect(toXY({ lat: -89, lon: 0 }).y).toBeGreaterThan(0);
    expect(toXY({ lat: -89, lon: 90 }).x).toBeGreaterThan(0);
  });
  it('offset moves the right ground distance', () => {
    const a = toXY(SITE_A);
    const b = toLatLon(offset(a, 60, 5000));
    const d = distanceAz(SITE_A, b);
    expect(d.m).toBeCloseTo(5000, -1);
    expect(d.az).toBeCloseTo(60, 0);
  });
});

describe('JPL Horizons ephemeris', () => {
  // Direct topocentric Horizons query (CENTER coord@301, SITE_COORD -138.468,-89.445,1.954 km, AIRLESS), 2026-11-13.
  const ref = [
    ['2027-02-10T00:00:00Z', 274.933434, 0.076707],
    ['2027-02-10T06:00:00Z', 271.886632, 0.040779],
    ['2027-02-10T12:00:00Z', 268.840081, 0.004731],
    ['2027-02-11T00:00:00Z', 262.747792, -0.0674],
  ] as const;
  it.each(ref)('Sun at %s matches Horizons within 0.01°', (iso, az, el) => {
    const r = azEl(eph, 'sun', SITE_A, 1954, Date.parse(iso));
    expect(Math.abs(((r.az - az + 540) % 360) - 180)).toBeLessThan(0.01);
    expect(Math.abs(r.el - el)).toBeLessThan(0.01);
  });
  it('covers Nov 2026 to Dec 2035 hourly', () => {
    expect(eph.file.count).toBe(80352);
    expect(new Date(eph.endMs).toISOString()).toBe('2035-12-31T23:00:00.000Z');
  });
  it('solar disc fraction', () => {
    const r = sunRadiusDeg(149_597_870.7);
    expect(r).toBeCloseTo(0.2666, 3);
    expect(discFractionVisible(0, r)).toBeCloseTo(0.5, 9);
    expect(discFractionVisible(r, r)).toBe(1);
    expect(discFractionVisible(-r, r)).toBe(0);
  });
});

describe('LOLA terrain', () => {
  it('40 m tiles load and agree with the 240 m grid; Shackleton floor is a deep depression', async () => {
    const t = realTerrain();
    await t.init();
    const floor = toXY({ lat: -89.67, lon: 129.78 });
    const rim = toXY({ lat: -89.9, lon: 0 });
    await t.ensureDetail(floor, 25_000);
    expect(t.hasDetail(floor)).toBe(true);
    expect(Math.abs(t.heightAt(floor) - t.regionalHeightAt(floor))).toBeLessThan(150);
    expect(t.heightAt(rim) - t.heightAt(floor)).toBeGreaterThan(2500);
  });
});

describe('horizon', () => {
  it('flat sphere: horizon dip equals −√(2h/R)', () => {
    const o = toXY(SITE_A);
    const hz = computeHorizon(fakeTerrain(o, () => 0), o, 2, 10);
    const dip = -Math.sqrt((2 * 2) / 1_737_400) * (180 / Math.PI);
    for (const e of hz.el) expect(e).toBeCloseTo(dip, 2);
  });
  it('a 1 km wall 10 km east raises only the east', () => {
    const o = toXY(SITE_A);
    const hz = computeHorizon(fakeTerrain(o, (e, n) => (e > 9_900 && e < 10_100 && Math.abs(n) < 3_000 ? 1000 : 0)), o, 2, 5);
    expect(horizonAt(hz, 90)).toBeGreaterThan(5);
    expect(horizonAt(hz, 270)).toBeLessThan(0);
  });
});

describe('mission', () => {
  it('battery hours = usable energy / night load; events are ordered', () => {
    const o = toXY(SITE_A);
    const hz = computeHorizon(fakeTerrain(o, () => 0), o, 2, 1);
    const r = simulate(eph, hz, SITE_A, Date.parse('2027-02-01T00:00:00Z'), Date.parse('2027-03-01T00:00:00Z'), SC, LIM);
    if ('kind' in r) throw new Error(r.code);
    expect(r.batteryHours).toBeCloseTo((2320 * 0.85) / 100, 6);
    for (let i = 1; i < r.events.length; i++) expect(r.events[i]!.tMs).toBeGreaterThanOrEqual(r.events[i - 1]!.tMs);
    expect(r.sunVisiblePct).toBeGreaterThan(0);
    expect(r.sunVisiblePct).toBeLessThanOrEqual(100);
    // flat horizon at the pole: the Sun skims the horizon, so a dark spell must exist in a 28-day window
    expect(hours(r.longestDark)).toBeGreaterThan(0);
  });
  it('a battery that cannot cover the darkness is reported with both numbers', () => {
    const o = toXY(SITE_A);
    const hz = computeHorizon(fakeTerrain(o, () => 0), o, 2, 1);
    const tiny = { ...SC, batteryWh: 50 };
    const r = simulate(eph, hz, SITE_A, Date.parse('2027-02-01T00:00:00Z'), Date.parse('2027-03-01T00:00:00Z'), tiny, LIM);
    if ('kind' in r) throw new Error(r.code);
    const reasons = powerCommsReasons(r, LIM);
    expect(reasons[0]?.code).toBe('battery');
  });
  it('outside the Horizons range is insufficient data', () => {
    const o = toXY(SITE_A);
    const hz = computeHorizon(fakeTerrain(o, () => 0), o, 2, 10);
    const r = simulate(eph, hz, SITE_A, Date.parse('2037-01-01T00:00:00Z'), Date.parse('2037-01-10T00:00:00Z'), SC, LIM);
    expect(r).toEqual({ kind: 'insufficient', code: 'no-ephemeris' });
  });
});

describe('landing', () => {
  it('flat ground is safe', () => {
    const o = toXY(SITE_A);
    const r = analyseLanding(fakeTerrain(o, () => 0), o, { northM: 200, eastM: 100, southM: 50, westM: 100 }, 4, 10);
    expect(r.safe).toBe(true);
    expect(r.maxSlopeDeg).toBeLessThan(0.01);
  });
  it('a 20° slope only to the north is unsafe and the suggestion moves south', () => {
    const o = toXY(SITE_A);
    const t = fakeTerrain(o, (_e, n) => (n > 120 ? (n - 120) * Math.tan((20 * Math.PI) / 180) : 0));
    const r = analyseLanding(t, o, { northM: 200, eastM: 50, southM: 50, westM: 50 }, 4, 10);
    expect(r.safe).toBe(false);
    expect(r.maxSlopeDeg).toBeGreaterThan(15);
    expect(r.suggestion).not.toBeNull();
    const az = r.suggestion!.azDeg;
    expect(az > 90 && az < 270).toBe(true);
  });
});

describe('reference results at the default site (Connecting Ridge crest, real NASA data)', () => {
  // Values recorded 2026-11-13 from this exact pipeline; a rebuild must reproduce them.
  it('horizon, Sun, Earth and battery over two windows', async () => {
    const t = realTerrain();
    await t.init();
    const site = { lat: -89.4391, lon: -137.1912 };
    const q = toXY(site);
    await t.ensureDetail(q, 13_000);
    const hz = computeHorizon(t, q, 2, 1);
    expect(Math.max(...hz.el)).toBeCloseTo(-0.44, 1);
    expect(hz.groundM).toBeCloseTo(1958, -1);
    const run = (a: string, b: string) => {
      const r = simulate(eph, hz, site, Date.parse(a), Date.parse(b), SC, { ...LIM, minEarthElDeg: 1, minContactHPerDay: 2 });
      if ('kind' in r) throw new Error(r.code);
      return r;
    };
    const jan = run('2027-01-20T00:00:00Z', '2027-02-03T00:00:00Z');
    expect(jan.sunVisiblePct).toBeCloseTo(100, 0);
    expect(hours(jan.longestDark)).toBe(0);
    expect(jan.earthVisiblePct).toBeCloseTo(23.6, 0);
    expect(hours(jan.longestBlackout)).toBeCloseTo(256.7, -1);
    const jun = run('2027-06-01T00:00:00Z', '2027-07-01T00:00:00Z');
    expect(jun.sunVisiblePct).toBeCloseTo(78.6, 0);
    expect(hours(jun.longestDark)).toBeCloseTo(93, -1);
    expect(jun.earthVisiblePct).toBeCloseTo(51.9, 0);
  });
});

describe('v2: outage runs and 75°S coverage', () => {
  it('lists every darkness and blackout run, longest first', async () => {
    const t = realTerrain();
    await t.init();
    const site = { lat: -89.4391, lon: -137.1912 };
    const q = toXY(site);
    await t.ensureDetail(q, 13_000);
    const hz = computeHorizon(t, q, 2, 1);
    const r = simulate(eph, hz, site, Date.parse('2027-06-01T00:00:00Z'), Date.parse('2027-07-01T00:00:00Z'), SC, { ...LIM, minEarthElDeg: 1 });
    if ('kind' in r) throw new Error(r.code);
    expect(r.darkRuns.length).toBeGreaterThan(0);
    expect((r.darkRuns[0]!.endMs - r.darkRuns[0]!.startMs) / 3_600_000).toBeCloseTo(hours(r.longestDark), 6);
    for (let i = 1; i < r.darkRuns.length; i++) {
      expect(r.darkRuns[i - 1]!.endMs - r.darkRuns[i - 1]!.startMs).toBeGreaterThanOrEqual(r.darkRuns[i]!.endMs - r.darkRuns[i]!.startMs);
    }
    expect((r.blackoutRuns[0]!.endMs - r.blackoutRuns[0]!.startMs) / 3_600_000).toBeCloseTo(hours(r.longestBlackout), 6);
  });
  it('works between 75° and 80° S on the 240 m grid', async () => {
    const t = realTerrain();
    await t.init();
    expect(t.minLatDeg).toBe(-75);
    const site = { lat: -76, lon: 0 };
    const hz = computeHorizon(t, toXY(site), 2, 1);
    expect(Array.from(hz.el).every(Number.isFinite)).toBe(true);
    const r = simulate(eph, hz, site, Date.parse('2027-03-01T00:00:00Z'), Date.parse('2027-03-08T00:00:00Z'), SC, LIM);
    expect('kind' in r).toBe(false);
  });
  it('long missions stay fast', () => {
    const o = toXY(SITE_A);
    const hz = computeHorizon(fakeTerrain(o, () => 0), o, 2, 10);
    const t0 = performance.now();
    const r = simulate(eph, hz, SITE_A, Date.parse('2026-11-02T00:00:00Z'), Date.parse('2035-12-30T00:00:00Z'), SC, LIM, 60);
    expect(performance.now() - t0).toBeLessThan(3000);
    if ('kind' in r) throw new Error(r.code);
    for (let i = 1; i < r.darkRuns.length; i++) {
      expect(r.darkRuns[i - 1]!.endMs - r.darkRuns[i - 1]!.startMs).toBeGreaterThanOrEqual(r.darkRuns[i]!.endMs - r.darkRuns[i]!.startMs);
    }
  });
});

describe('v2 review fixes', () => {
  it('site search yields between failing candidates, so it can be aborted quickly', async () => {
    const { searchSites } = await import('./alternatives');
    const o = toXY(SITE_A);
    const flat = fakeTerrain(o, () => 0);
    const hungry: Spacecraft = { ...SC, nightLoadW: 5000, batteryWh: 100 };
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 30);
    const t0 = performance.now();
    await searchSites(eph, flat, SITE_A, 10, Date.parse('2027-01-01T00:00:00Z'), Date.parse('2028-06-01T00:00:00Z'), hungry, LIM, { dispersion: DISP, want: 5, signal: ctl.signal });
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it('simulation step grows with mission length', async () => {
    const { stepMinutesFor } = await import('./mission');
    expect(stepMinutesFor(14 * 86_400_000)).toBe(10);
    expect(stepMinutesFor(60 * 86_400_000)).toBe(10);
    expect(stepMinutesFor(365 * 86_400_000)).toBe(20);
    expect(stepMinutesFor(9 * 365 * 86_400_000)).toBe(60);
  });
});

describe('v2.1 feedback', () => {
  const o = toXY(SITE_A);
  const flatHz = () => computeHorizon(fakeTerrain(o, () => 0), o, 2, 10);
  it('the verdict has no daily-contact rule, even with a 24 h requirement', () => {
    const r = simulate(eph, flatHz(), SITE_A, Date.parse('2027-03-01T00:00:00Z'), Date.parse('2027-04-01T00:00:00Z'), SC, { ...LIM, minContactHPerDay: 24 });
    if ('kind' in r) throw new Error(r.code);
    expect(powerCommsReasons(r, { ...LIM, minContactHPerDay: 24 }).map((x) => x.code)).not.toContain('contact');
  });
  it('the blackout reason counts the outages', () => {
    const r = simulate(eph, flatHz(), SITE_A, Date.parse('2027-01-01T00:00:00Z'), Date.parse('2027-04-01T00:00:00Z'), SC, LIM);
    if ('kind' in r) throw new Error(r.code);
    const b = powerCommsReasons(r, LIM).find((x) => x.code === 'blackout');
    expect(b && b.code === 'blackout' ? b.count : -1).toBe(r.blackoutRuns.length);
  });
  it('the longest darkness is one continuous stretch with the Sun fully hidden', () => {
    const r = simulate(eph, flatHz(), SITE_A, Date.parse('2027-05-01T00:00:00Z'), Date.parse('2027-08-01T00:00:00Z'), SC, LIM);
    if ('kind' in r) throw new Error(r.code);
    const run = r.darkRuns[0]!;
    for (let i = 0; i < r.t.length; i++) if (r.t[i]! >= run.startMs && r.t[i]! < run.endMs) expect(r.sunFrac[i]).toBe(0);
    const before = r.t.findIndex((x) => x >= run.startMs) - 1;
    if (before >= 0) expect(r.sunFrac[before]).toBeGreaterThan(0);
  });
  it('major events keep only long outages and battery events', async () => {
    const { majorEvents } = await import('./mission');
    const r = simulate(eph, flatHz(), SITE_A, Date.parse('2027-01-01T00:00:00Z'), Date.parse('2027-04-01T00:00:00Z'), SC, LIM);
    if ('kind' in r) throw new Error(r.code);
    const ev = majorEvents(r, 8);
    expect(ev.length).toBeLessThanOrEqual(8);
    expect(ev.length).toBeLessThan(r.events.length);
    for (let i = 1; i < ev.length; i++) expect(ev[i]!.tMs).toBeGreaterThanOrEqual(ev[i - 1]!.tMs);
  });
});

describe('100 km automatic search', () => {
  it('search rings are dense near the site and sparse far away, covering the whole 75°S cap', async () => {
    const { searchRings, ALT_RADIUS_KM } = await import('./alternatives');
    expect(ALT_RADIUS_KM).toBe(2000);
    const r = searchRings(ALT_RADIUS_KM);
    expect(r[0]).toBe(0.5);
    // the farthest covered point from any covered site is < 2 × 460 km (pole to 75°S)
    expect(r[r.length - 1]).toBeGreaterThanOrEqual(920);
    expect(searchRings(100).at(-1)).toBe(100);
    expect(r.length).toBeLessThanOrEqual(32);
    for (let i = 1; i < r.length; i++) expect(r[i]! - r[i - 1]!).toBeGreaterThanOrEqual(r[i - 1]! - (r[i - 2] ?? 0) - 1e-9);
  });
  it('reports partial results while searching', async () => {
    const { searchSites } = await import('./alternatives');
    const o = toXY(SITE_A);
    const hungry: Spacecraft = { ...SC, nightLoadW: 5000, batteryWh: 100 };
    let calls = 0;
    await searchSites(eph, fakeTerrain(o, () => 0), SITE_A, 2, Date.parse('2027-05-01T00:00:00Z'), Date.parse('2027-05-08T00:00:00Z'), hungry, LIM, { dispersion: DISP, want: 3, onProgress: () => { calls++; } });
    expect(calls).toBeGreaterThan(1);
  }, 60_000);
});

describe('ranked safe landing points', () => {
  it('lists up to 5 safe aim points, nearest first, each in its own direction', () => {
    const o = toXY(SITE_A);
    const t = fakeTerrain(o, (_e, n) => (n > 120 ? (n - 120) * Math.tan((20 * Math.PI) / 180) : 0));
    const r = analyseLanding(t, o, { northM: 200, eastM: 50, southM: 50, westM: 50 }, 4, 10);
    expect(r.safeAims.length).toBeGreaterThan(1);
    expect(r.safeAims.length).toBeLessThanOrEqual(5);
    expect(r.safeAims[0]).toEqual(r.suggestion);
    for (let i = 1; i < r.safeAims.length; i++) expect(r.safeAims[i]!.distanceM).toBeGreaterThanOrEqual(r.safeAims[i - 1]!.distanceM);
    expect(new Set(r.safeAims.map((s) => s.azDeg)).size).toBe(r.safeAims.length);
    expect(new Set(r.safeAims.map((s) => Math.round(s.azDeg / 45) % 8)).size).toBe(r.safeAims.length);
    expect(r.safeAims.every((s) => s.maxSlopeDeg <= 10)).toBe(true);
  });
  it('a safe zone has no alternatives to offer', () => {
    const o = toXY(SITE_A);
    const r = analyseLanding(fakeTerrain(o, () => 0), o, { northM: 100, eastM: 100, southM: 100, westM: 100 }, 4, 10);
    expect(r.safe).toBe(true);
    expect(r.safeAims).toEqual([]);
  });
});

describe('highest point of a region', () => {
  it('finds the top of a hill inside a polygon', async () => {
    const { highestPoint } = await import('./landing');
    const o = toXY(SITE_A);
    // a hill peaking 3 km east of the origin
    const t = fakeTerrain(o, (e, n) => 1000 - Math.hypot(e - 3000, n) / 10);
    const { east, north } = localAxes(o);
    const p = (e: number, n: number) => [o.x + e * east.x + n * north.x, o.y + e * east.y + n * north.y];
    const ring = [p(-5000, -5000), p(5000, -5000), p(5000, 5000), p(-5000, 5000), p(-5000, -5000)];
    const top = highestPoint(t, ring, 250);
    const d = Math.hypot(top.x - p(3000, 0)[0]!, top.y - p(3000, 0)[1]!);
    expect(d).toBeLessThan(400);
  });
});

describe('alternative sites (MASTER-PROMPT §8): only fully suitable sites', () => {
  const o = toXY(SITE_A);
  // A 20° cone around the chosen site, flat beyond 300 m: the origin fails on slope only.
  const cone = () => fakeTerrain(o, (e, n) => Math.min(Math.hypot(e, n), 300) * Math.tan((20 * Math.PI) / 180));
  const big: Spacecraft = { ...SC, batteryWh: 500_000 };
  const easy: Limits = { ...LIM, maxBlackoutH: 100_000 };
  const A = Date.parse('2027-01-20T00:00:00Z'), B = Date.parse('2027-01-27T00:00:00Z');

  it('returns only suitable results, nearest first', async () => {
    const { searchSites, checkSite } = await import('./alternatives');
    const t = cone();
    const r = await searchSites(eph, t, SITE_A, 2, A, B, big, easy, { dispersion: DISP, want: 3 });
    expect(r.reason).toBeNull();
    expect(r.sites).toHaveLength(3);
    for (let i = 1; i < r.sites.length; i++) expect(r.sites[i]!.distanceM).toBeGreaterThanOrEqual(r.sites[i - 1]!.distanceM);
    for (const x of r.sites) {
      const c = checkSite(eph, t, toXY(x.site), A, B, big, easy, DISP, 1, 10);
      expect(c).not.toBeNull();
      expect(c!.reasons).toEqual([]);
    }
  }, 60_000);

  it('a result never has the same failing check as the origin unless it actually passes', async () => {
    const { searchSites, checkSite } = await import('./alternatives');
    const t = cone();
    const origin = checkSite(eph, t, o, A, B, big, easy, DISP, 1, 10)!;
    expect(origin.reasons.map((x) => x.code)).toEqual(['slope']);
    const r = await searchSites(eph, t, SITE_A, 2, A, B, big, easy, { dispersion: DISP, want: 3 });
    for (const x of r.sites) {
      const codes = checkSite(eph, t, toXY(x.site), A, B, big, easy, DISP, 1, 10)!.reasons.map((y) => y.code);
      for (const fail of origin.reasons) expect(codes).not.toContain(fail.code);
    }
  }, 60_000);

  it('returns [] with the dominant reason when nothing within the radius passes', async () => {
    const { searchSites } = await import('./alternatives');
    const hungry: Spacecraft = { ...SC, nightLoadW: 5000, batteryWh: 100 };
    const r = await searchSites(eph, fakeTerrain(o, () => 0), SITE_A, 2, Date.parse('2027-05-01T00:00:00Z'), Date.parse('2027-05-20T00:00:00Z'), hungry, easy, { dispersion: DISP });
    expect(r.sites).toEqual([]);
    expect(r.reason).toBe('battery');
  }, 60_000);

  it('candidates rejected by the screening raster are never simulated; the reason is then the light', async () => {
    const { searchSites } = await import('./alternatives');
    const r = await searchSites(eph, fakeTerrain(o, () => 0), SITE_A, 2, A, B, big, easy, { dispersion: DISP, screen: () => false });
    expect(r).toEqual({ sites: [], reason: 'light' });
  });
});
