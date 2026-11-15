/**
 * South-pole map on NASA Moon Trek WMTS tiles (south polar stereographic, the projection of src/planner/polar.ts).
 * No mapping library: tiles are <img>/<canvas>, overlays are SVG in screen space.
 *
 * Sharpness: the tile level is chosen from the device pixel ratio, so a tile's native resolution is at least the
 * screen's (up to WAC z4 and NAC z12, the highest levels Moon Trek serves). The level below is drawn underneath while
 * the sharp tiles load, and tiles fade in. Where NAC has no data (opaque black) it is made transparent; zoomed in, a
 * NASA LOLA hillshade (40 m near the pole, 240 m elsewhere) sits under NAC instead of a stretched WAC image.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPE } from 'react';
import type { PlannerData } from '../data/data';
import { radiusTowards, type Dispersion } from '../planner/landing';
import { offset, toLatLon, toXY, type LatLon, type XY } from '../planner/polar';
import { fmtKm, useT } from '../i18n';
import { usePlanner } from '../state/store';
import { Icon } from '../ui/Icon';

const TREK = 'https://trek.nasa.gov/tiles/Moon/SP';
const DATA = `${import.meta.env.BASE_URL}data/`;
const ORIGIN = 1_095_930;
const RES0 = (2 * ORIGIN) / 256;
const MIN_RES = 0.6;
const MAX_RES = 2000;

interface TileLayer { readonly id: string; readonly maxZ: number; readonly extentM: number; readonly cut?: boolean }
const WAC: TileLayer = { id: 'LRO_WAC_Mosaic_SPole60_100mp', maxZ: 4, extentM: 931_100 };
const NAC: TileLayer = { id: 'LRO_NAC_Mosaic_1mpp_SP', maxZ: 12, extentM: 136_700, cut: true };

interface View { c: XY; res: number }

function Tile({ src, style, cut }: { src: string; style: CSSProperties; cut?: boolean }) {
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!cut) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let alive = true;
    img.onload = () => {
      const cv = ref.current;
      const g = cv?.getContext('2d', { willReadFrequently: true });
      if (!alive || !cv || !g) return;
      g.drawImage(img, 0, 0, 256, 256);
      const d = g.getImageData(0, 0, 256, 256);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) if (p[i]! < 3 && p[i + 1]! < 3 && p[i + 2]! < 3) p[i + 3] = 0;
      g.putImageData(d, 0, 0);
      setOn(true);
    };
    img.src = src;
    return () => { alive = false; };
  }, [src, cut]);
  if (cut) return <canvas ref={ref} className={on ? 'tile in' : 'tile'} width={256} height={256} style={style} />;
  return <img className={on ? 'tile in' : 'tile'} src={src} alt="" draggable={false} style={style} onLoad={() => setOn(true)} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />;
}

function Tiles({ layer, z, view, w, h, pad }: { layer: TileLayer; z: number; view: View; w: number; h: number; pad: number }) {
  const zz = Math.max(0, Math.min(z, layer.maxZ));
  const span = 256 * (RES0 / 2 ** zz);
  const x0 = view.c.x - (w / 2) * view.res, x1 = view.c.x + (w / 2) * view.res;
  const y0 = view.c.y - (h / 2) * view.res, y1 = view.c.y + (h / 2) * view.res;
  const c0 = Math.floor((Math.max(x0, -layer.extentM) + ORIGIN) / span) - pad;
  const c1 = Math.floor((Math.min(x1, layer.extentM) + ORIGIN) / span) + pad;
  const r0 = Math.floor((ORIGIN - Math.min(y1, layer.extentM)) / span) - pad;
  const r1 = Math.floor((ORIGIN - Math.max(y0, -layer.extentM)) / span) + pad;
  const n = 2 ** zz;
  const size = span / view.res;
  const out = [];
  for (let r = Math.max(0, r0); r <= Math.min(n - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(n - 1, c1); c++) {
      const left = (-ORIGIN + c * span - x0) / view.res;
      const top = (y1 - (ORIGIN - r * span)) / view.res;
      const src = `${TREK}/${layer.id}/1.0.0//default/default028mm/${zz}/${r}/${c}.png`;
      out.push(<Tile key={`${layer.id}/${zz}/${r}/${c}`} src={src} cut={layer.cut} style={{ left, top, width: size + 0.5, height: size + 0.5 }} />);
    }
  }
  return <>{out}</>;
}

/** NASA LOLA hillshade of the view, under NAC: a sharp relief where no image covers the ground. */
function Hillshade({ data, view, w, h }: { data: PlannerData; view: View; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      const cv = ref.current;
      const g = cv?.getContext('2d');
      if (!cv || !g) return;
      const step = 3;
      const cw = Math.ceil(w / step), ch = Math.ceil(h / step);
      cv.width = cw; cv.height = ch;
      const img = g.createImageData(cw, ch);
      const dm = Math.max(view.res * step, 20);
      const lx = -0.5, ly = 0.6, lz = 0.62;
      for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) {
          const x = view.c.x + (i * step - w / 2) * view.res, y = view.c.y - (j * step - h / 2) * view.res;
          const hx = data.terrain.heightAt({ x: x + dm, y }) - data.terrain.heightAt({ x: x - dm, y });
          const hy = data.terrain.heightAt({ x, y: y + dm }) - data.terrain.heightAt({ x, y: y - dm });
          const k = (i + j * cw) * 4;
          if (!Number.isFinite(hx) || !Number.isFinite(hy)) { img.data[k + 3] = 0; continue; }
          const nx = -hx / (2 * dm), ny = -hy / (2 * dm);
          const s = Math.max(0, (nx * lx + ny * ly + lz) / Math.hypot(nx, ny, 1));
          const v = Math.round(30 + 180 * s);
          img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v + 4; img.data[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }, 60);
    return () => clearTimeout(id);
  }, [data, view, w, h]);
  return <canvas ref={ref} className="hillshade" style={{ width: w, height: h }} aria-hidden="true" />;
}

function niceDistance(m: number): number {
  const p = 10 ** Math.floor(Math.log10(m));
  const k = m / p;
  return (k >= 5 ? 5 : k >= 2 ? 2 : 1) * p;
}

interface Props {
  readonly data: PlannerData;
  readonly site: LatLon;
  readonly onPick: (p: LatLon) => void;
  /** Ellipse mode: draw the landing ellipse and start zoomed in to a few hundred metres. */
  readonly dispersion?: Dispersion;
  /** Site mode: "YYYY-MM" of the Sun & Earth colour layer (toggled by the layers button). */
  readonly suitMonth?: string;
}

export function MoonMap({ data, site, onPick, dispersion, suitMonth }: Props) {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const suitOn = usePlanner((s) => s.suitLayer);
  const set = usePlanner((s) => s.set);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const siteXY = useMemo(() => toXY(site), [site]);
  const ellipse = !!dispersion;
  const [view, setView] = useState<View>({ c: siteXY, res: ellipse ? 2 : 150 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; x: number; y: number; c: XY; dist: number; res: number } | null>(null);
  const dpr = Math.min(3, window.devicePixelRatio || 1);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ellipse mode: frame the ellipse once the map has a size (a few hundred metres across).
  const framed = useRef(false);
  useLayoutEffect(() => {
    if (!ellipse || framed.current || !size.w) return;
    framed.current = true;
    const axis = Math.max(dispersion!.northM + dispersion!.southM, dispersion!.eastM + dispersion!.westM);
    // Not finer than about half the NAC pixel (2.09 m at z12), so the image is never stretched more than 2x.
    setView({ c: siteXY, res: Math.max(1.05, Math.max(400, axis * 3.5) / Math.min(size.w, size.h)) });
  }, [ellipse, size.w, size.h, dispersion, siteXY]);

  const { w, h } = size;
  // Recentre when the site changes from outside the map and leaves the comfortable middle of the view.
  const [lastSite, setLastSite] = useState(siteXY);
  if (lastSite !== siteXY) {
    setLastSite(siteXY);
    const sx = (siteXY.x - view.c.x) / view.res, sy = (view.c.y - siteXY.y) / view.res;
    if (Math.abs(sx) > w * 0.36 || Math.abs(sy) > h * 0.36) setView((v) => ({ ...v, c: siteXY }));
  }

  const z = Math.max(0, Math.ceil(Math.log2((RES0 * dpr) / view.res) - 0.15));
  const toScreen = (q: XY) => ({ x: (q.x - view.c.x) / view.res + w / 2, y: (view.c.y - q.y) / view.res + h / 2 });
  const toWorld = (sx: number, sy: number): XY => ({ x: view.c.x + (sx - w / 2) * view.res, y: view.c.y - (sy - h / 2) * view.res });

  const zoomAt = (factor: number, sx = w / 2, sy = h / 2) => setView((v) => {
    const res = Math.min(MAX_RES, Math.max(MIN_RES, v.res * factor));
    const wx = v.c.x + (sx - w / 2) * v.res, wy = v.c.y - (sy - h / 2) * v.res;
    return { res, c: { x: wx - (sx - w / 2) * res, y: wy + (sy - h / 2) * res } };
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(Math.max(-1, Math.min(1, e.deltaY / 300))), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const local = (e: RPE) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const twoFinger = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 } : null;
  };
  const down = (e: RPE) => {
    if ((e.target as Element).closest('button')) return;
    box.current?.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const two = twoFinger();
    gesture.current = { moved: pointers.current.size > 1, x: two?.mx ?? p.x, y: two?.my ?? p.y, c: view.c, dist: two?.d ?? 0, res: view.res };
  };
  const move = (e: RPE) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const two = twoFinger();
    if (two && g.dist > 0) {
      g.moved = true;
      const res = Math.min(MAX_RES, Math.max(MIN_RES, g.res * (g.dist / Math.max(1, two.d))));
      const wx = g.c.x + (g.x - w / 2) * g.res, wy = g.c.y - (g.y - h / 2) * g.res;
      setView({ res, c: { x: wx - (two.mx - w / 2) * res, y: wy + (two.my - h / 2) * res } });
      return;
    }
    const p = local(e);
    const dx = p.x - g.x, dy = p.y - g.y;
    if (Math.hypot(dx, dy) > 5) g.moved = true;
    if (g.moved) setView((v) => ({ ...v, c: { x: g.c.x - dx * v.res, y: g.c.y + dy * v.res } }));
  };
  const up = (e: RPE) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) {
      // one finger left after a pinch: continue as a pan from here
      const [p] = [...pointers.current.values()];
      gesture.current = { moved: true, x: p!.x, y: p!.y, c: view.c, dist: 0, res: view.res };
      return;
    }
    gesture.current = null;
    if (g && !g.moved && e.type === 'pointerup') {
      const p = toLatLon(toWorld(local(e).x, local(e).y));
      if (p.lat <= data.terrain.minLatDeg) onPick(p);
    }
  };

  const zone = useMemo(() => {
    if (!dispersion) return '';
    const pts: string[] = [];
    for (let a = 0; a < 360; a += 4) {
      const q = toScreen(offset(siteXY, a, radiusTowards(dispersion, a)));
      pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`);
    }
    return pts.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispersion, siteXY, view, w, h]);

  const s = toScreen(siteXY);
  const suit = data.suit;
  const showSuit = !ellipse && suitOn && suit && suitMonth && suit.months.includes(suitMonth);
  const tl = suit ? toScreen({ x: -suit.extentM, y: suit.extentM }) : { x: 0, y: 0 };
  const scaleM = niceDistance(view.res * 110);
  const ready = w > 0 && h > 0;

  return (
    <div className={ellipse ? 'map tall' : 'map'} dir="ltr" ref={box} role="application" aria-label={t(ellipse ? 'map.labelEllipse' : 'map.label')}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {ready ? (
        <>
          <Tiles layer={WAC} z={z - 1} view={view} w={w} h={h} pad={0} />
          <Tiles layer={WAC} z={z} view={view} w={w} h={h} pad={1} />
          {view.res < 150 ? <Hillshade data={data} view={view} w={w} h={h} /> : null}
          {view.res < 600 ? <><Tiles layer={NAC} z={z - 1} view={view} w={w} h={h} pad={0} /><Tiles layer={NAC} z={z} view={view} w={w} h={h} pad={1} /></> : null}
          <svg className="map-svg" width={w} height={h}>
            {showSuit ? <image href={`${DATA}suit/${suitMonth}.png`} x={tl.x} y={tl.y} width={(2 * suit.extentM) / view.res} height={(2 * suit.extentM) / view.res} preserveAspectRatio="none" className="suit-img" /> : null}
            {zone ? <polygon points={zone} className="zone" /> : null}
            <g className="pin" transform={`translate(${s.x},${s.y})`}><circle r={ellipse ? 5 : 9} /><circle r={ellipse ? 2 : 3.5} className="pin-c" /></g>
          </svg>
        </>
      ) : null}
      <div className="map-ctl">
        <button type="button" className="map-btn" aria-label={t('map.zoomIn')} onClick={() => zoomAt(0.5)}><Icon name="plus" /></button>
        <button type="button" className="map-btn" aria-label={t('map.zoomOut')} onClick={() => zoomAt(2)}><Icon name="minus" /></button>
        {!ellipse ? <button type="button" className="map-btn" aria-pressed={suitOn} aria-label={t('map.layer')} onClick={() => set({ suitLayer: !suitOn })}><Icon name="layers" /></button> : null}
      </div>
      {showSuit ? (
        <div className="map-legend" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <span><i className="sw good" />{t('map.legendGood')}</span>
          <span><i className="sw bad" />{t('map.legendBad')}</span>
        </div>
      ) : null}
      <div className="map-scale"><i style={{ width: scaleM / view.res }} /><span>{fmtKm(lang, scaleM)}</span></div>
      <div className="map-credit">{t('map.credit')}</div>
    </div>
  );
}
