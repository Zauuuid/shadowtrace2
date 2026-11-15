import { useEffect, useState } from 'react';
import { makeEphemeris, type Ephemeris, type EphemerisFile } from '../planner/ephemeris';
import { PolarTerrain, type GridMeta, type TileMeta } from '../planner/terrain';

const BASE = import.meta.env.BASE_URL;

/** Decompress only if the bytes are still gzip: some servers send .gz with Content-Encoding and the browser already inflated it. */
export async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export interface NamedFeature {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly diameterKm: number;
  readonly kind: string;
}
export interface SuitMeta {
  readonly extentM: number;
  readonly sizePx: number;
  readonly months: readonly string[];
  readonly rule: string;
}
export interface PlannerData {
  readonly eph: Ephemeris;
  /** Monthly landing-suitability images (public/data/suit/), or null if missing. */
  readonly suit: SuitMeta | null;
  readonly terrain: PolarTerrain;
  readonly names: readonly NamedFeature[];
}

let cache: Promise<PlannerData> | null = null;
let ephBytes: Promise<ArrayBuffer> | null = null;
let ephCache: Promise<EphemerisFile> | null = null;

/** Download the ephemeris without parsing it (idle prefetch on the opening pages: no long task there). */
export function prefetchEphemeris(): Promise<ArrayBuffer> {
  ephBytes ??= fetch(`${BASE}data/ephemeris.json`).then((r) => {
    if (!r.ok) { ephBytes = null; throw new Error(`ephemeris.json: ${r.status}`); }
    return r.arrayBuffer();
  });
  return ephBytes;
}

/** The parsed ephemeris (when the planner needs it). */
export function loadEphemerisFile(): Promise<EphemerisFile> {
  ephCache ??= prefetchEphemeris().then((b) => JSON.parse(new TextDecoder().decode(b)) as EphemerisFile);
  ephCache.catch(() => { ephCache = null; });
  return ephCache;
}

/** Forget a failed load so the UI can retry. */
export function resetPlannerData(): void { cache = null; }

export function loadPlannerData(): Promise<PlannerData> {
  cache ??= (async () => {
    const json = (p: string) => fetch(`${BASE}data/${p}`).then((r) => {
      if (!r.ok) throw new Error(`${p}: ${r.status}`);
      return r.json();
    });
    const terrain = new PolarTerrain({
      regional: async () => {
        const meta = (await json('lola_south_240m.json')) as GridMeta;
        const res = await fetch(`${BASE}data/lola_south_240m.bin.gz`);
        if (!res.ok) throw new Error(`lola_south_240m.bin.gz: ${res.status}`);
        const buf = await gunzip(await res.arrayBuffer());
        if (buf.byteLength !== meta.size * meta.size * 2) throw new Error(`lola_south_240m: ${buf.byteLength} bytes`);
        return { meta, dn: new Int16Array(buf) };
      },
      tileMeta: async () => (await json('dem40/meta.json')) as TileMeta,
      tile: async (r, c) => {
        const res = await fetch(`${BASE}data/dem40/r${r}_c${c}.bin.gz`);
        if (!res.ok) throw new Error(`tile ${r},${c}`);
        const raw = await gunzip(await res.arrayBuffer());
        if (raw.byteLength !== 512 * 512 * 2) throw new Error(`tile ${r},${c}: ${raw.byteLength} bytes`);
        return new Int16Array(raw);
      },
    });
    // Ephemeris first: it is the file the result needs most and it may already be cached by the idle prefetch.
    const eph = loadEphemerisFile();
    const [ephFile, namesFile, , suit] = await Promise.all([
      eph,
      json('lunar_names.json') as Promise<{ features: [string, number, number, number, string][] }>,
      terrain.init(),
      (json('suit/meta.json') as Promise<SuitMeta>).catch(() => null),
    ]);
    return {
      eph: makeEphemeris(ephFile),
      suit,
      terrain,
      names: namesFile.features.map(([name, lat, lon, diameterKm, kind]) => ({ name, lat, lon, diameterKm, kind })),
    };
  })();
  cache.catch(() => { cache = null; });
  return cache;
}

export function usePlannerData(attempt = 0): PlannerData | null | Error {
  const [d, setD] = useState<PlannerData | null | Error>(null);
  useEffect(() => {
    let live = true;
    loadPlannerData().then((x) => live && setD(x), (e: unknown) => live && setD(e instanceof Error ? e : new Error(String(e))));
    return () => { live = false; };
  }, [attempt]);
  return d;
}
