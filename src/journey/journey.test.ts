import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EphemerisFile } from '../planner/ephemeris';
import { bodyDirs, faceRotate, JOURNEY_DATE, JOURNEY_SUN, lonLatToVec3, poseFor, sunOnScreen } from './pose';

const DATA = 'public/data';
const SIZES: readonly [number, number][] = [[1440, 900], [1024, 768], [844, 390], [768, 1024], [412, 915], [390, 844], [360, 640]];

describe('Journey maths', () => {
  it('lon/lat convention: Tycho south, Crisium on the east (right) limb, nothing mirrored', () => {
    const face = (lat: number, lon: number) => faceRotate(lonLatToVec3(lat, lon), 0, 0);
    const tycho = face(-43.3, -11.4);
    expect(tycho[1]).toBeLessThan(-0.6);
    expect(tycho[0]).toBeLessThan(0);
    const crisium = face(17, 59);
    expect(crisium[0]).toBeGreaterThan(0.8);
    const c = faceRotate(lonLatToVec3(-6, -8), -6, -8);
    expect(c[2]).toBeCloseTo(1, 9);
  });

  it('the stored Sun of JOURNEY_DATE is the NASA JPL Horizons row (no ephemeris download on the opening pages)', () => {
    const f = JSON.parse(readFileSync(`${DATA}/ephemeris.json`, 'utf8')) as EphemerisFile;
    const t0 = Date.parse(f.startUtc.endsWith('Z') ? f.startUtc : `${f.startUtc}Z`);
    const i = (Date.parse(JOURNEY_DATE) - t0) / 3_600_000;
    expect(Number.isInteger(i)).toBe(true);
    expect(JOURNEY_SUN.lat).toBeCloseTo(f.sunLat[i]!, 5);
    expect(JOURNEY_SUN.lon).toBeCloseTo(f.sunLon[i]!, 5);
    const got = bodyDirs(f, JOURNEY_DATE).sun, want = lonLatToVec3(JOURNEY_SUN.lat, JOURNEY_SUN.lon);
    for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - want[k]!)).toBeLessThan(1e-6);
  });

  it.each(SIZES)('at %i×%i the whole disc fits the height and about 70 % of it is on screen', (w, h) => {
    for (const rtl of [false, true]) {
      for (const page of [0, 1] as const) {
        const p = poseFor(page, w, h, rtl);
        expect(p.d).toBeLessThanOrEqual(h);
        // visible share of the disc area, sampled
        let inside = 0, total = 0;
        for (let i = 0; i < 80; i++) for (let j = 0; j < 80; j++) {
          const x = p.x + ((i + 0.5) / 80 - 0.5) * p.d, y = p.y + ((j + 0.5) / 80 - 0.5) * p.d;
          if (Math.hypot(x - p.x, y - p.y) > p.d / 2) continue;
          total++;
          if (x >= 0 && x <= w && y >= p.top && y <= h) inside++;
        }
        expect(inside / total).toBeGreaterThan(0.62);
        expect(inside / total).toBeLessThan(0.9);
      }
    }
  });

  it('the lit side faces away from the text (right in English, left in Arabic, up on portrait phones)', () => {
    for (const page of [0, 1] as const) {
      expect(sunOnScreen(poseFor(page, 1440, 900, false))[0]).toBeGreaterThan(0.5);
      expect(sunOnScreen(poseFor(page, 1440, 900, true))[0]).toBeLessThan(-0.5);
      expect(sunOnScreen(poseFor(page, 390, 844, false))[1]).toBeGreaterThan(0.3);
    }
  });

  it('page 2 turns the south pole toward the viewer', () => {
    const pole = (rtl: boolean) => { const p = poseFor(1, 1440, 900, rtl); return faceRotate(lonLatToVec3(-90, 0), p.lat, p.lon); };
    for (const rtl of [false, true]) {
      expect(pole(rtl)[2]).toBeGreaterThan(0.5);
      expect(pole(rtl)[1]).toBeLessThan(0);
    }
  });

  it('texture manifest hashes equal the files; no 8k texture', () => {
    const meta = JSON.parse(readFileSync(`${DATA}/moon/moon_meta.json`, 'utf8')) as { files: { name: string; sha256: string }[]; source: { note: string } };
    expect(meta.source.note).toBe('optimized for aesthetics, not science');
    expect(meta.files.some((f) => f.name.includes('8k'))).toBe(false);
    for (const f of meta.files) expect(createHash('sha256').update(readFileSync(`${DATA}/moon/${f.name}`)).digest('hex')).toBe(f.sha256);
  });
});
