/**
 * Multi-year timeline. Main bar: Sun and Earth rows at the chosen site (JPL Horizons + LOLA horizon) over a zoomable
 * span, with two draggable handles for the mission start and end. Overview bar: the whole loaded range
 * (Nov 2026 – Dec 2035) with a draggable window. Time always runs left → right, in both languages.
 */
import { useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { azEl, discFractionVisible, sunRadiusDeg, type Ephemeris } from '../planner/ephemeris';
import { horizonAt, type Horizon } from '../planner/horizon';
import type { LatLon } from '../planner/polar';
import { fmtDayMonth, fmtMonth, fmtYear, useT, type Key } from '../i18n';
import { DAY, usePlanner } from '../state/store';
import { Icon } from '../ui/Icon';
import { useWidth } from './widgets';

const SPANS: readonly { days: number; key: Key; cols: number; sub: number }[] = [
  { days: 7, key: 'tl.week', cols: 168, sub: 1 },
  { days: 30, key: 'tl.month', cols: 240, sub: 1 },
  { days: 120, key: 'tl.months4', cols: 320, sub: 2 },
  { days: 365, key: 'tl.year', cols: 365, sub: 3 },
];

function useRows(eph: Ephemeris, horizon: Horizon, site: LatLon, minEarth: number, t0: number, span: number, cols: number, sub: number) {
  return useMemo(() => {
    const sun = new Float32Array(cols), earth = new Float32Array(cols);
    const step = span / cols;
    for (let c = 0; c < cols; c++) {
      let s = 0, e = 0;
      for (let k = 0; k < sub; k++) {
        const tm = Math.min(eph.endMs, Math.max(eph.startMs, t0 + c * step + (k + 0.5) * (step / sub)));
        const a = azEl(eph, 'sun', site, horizon.observerM, tm);
        s += discFractionVisible(a.el - horizonAt(horizon, a.az), sunRadiusDeg(a.km));
        const b = azEl(eph, 'earth', site, horizon.observerM, tm);
        e += b.el - horizonAt(horizon, b.az) >= minEarth ? 1 : 0;
      }
      sun[c] = s / sub;
      earth[c] = e / sub;
    }
    return { sun, earth };
  }, [eph, horizon, site, minEarth, t0, span, cols, sub]);
}

const NIGHT = '#151D2C';
const sunColor = (v: number) => (v <= 0 ? NIGHT : `rgba(242,179,92,${0.3 + 0.7 * v})`);
const earthColor = (v: number) => (v <= 0 ? NIGHT : `rgba(127,184,230,${0.3 + 0.7 * v})`);

export function Timeline({ eph, horizon, site }: { eph: Ephemeris; horizon: Horizon; site: LatLon }) {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const tz = usePlanner((s) => s.tz);
  const startMs = usePlanner((s) => s.startMs);
  const endMs = usePlanner((s) => s.endMs);
  const minEarth = usePlanner((s) => s.limits.minEarthElDeg);
  const set = usePlanner((s) => s.set);
  const [box, W] = useWidth<HTMLDivElement>();
  const missionDays = (endMs - startMs) / DAY;
  const [spanIdx, setSpanIdx] = useState(() => { const i = SPANS.findIndex((s) => s.days >= missionDays * 1.2); return i === -1 ? SPANS.length - 1 : i; });
  const cfg = SPANS[spanIdx]!;
  const span = cfg.days * DAY;
  const [anchor, setAnchor] = useState<number | null>(null);
  const viewStart = Math.max(eph.startMs, Math.min(eph.endMs - span, anchor ?? startMs - span * 0.12));
  const main = useRef<SVGSVGElement>(null);
  const over = useRef<SVGSVGElement>(null);
  const drag = useRef<'start' | 'end' | 'window' | null>(null);
  const grab = useRef(0);

  const rows = useRows(eph, horizon, site, minEarth, viewStart, span, cfg.cols, cfg.sub);
  const fullSpan = eph.endMs - eph.startMs;
  const overview = useRows(eph, horizon, site, minEarth, eph.startMs, fullSpan, 400, 4);

  const LH = 30, PAD = lang === 'ar' ? 64 : 56;
  const x = (tm: number) => PAD + ((tm - viewStart) / span) * (W - PAD);
  const tAt = (px: number) => viewStart + ((px - PAD) / (W - PAD)) * span;
  const ox = (tm: number) => ((tm - eph.startMs) / fullSpan) * W;
  const otAt = (px: number) => eph.startMs + (px / W) * fullSpan;

  const maxTicks = Math.max(2, Math.floor((W - PAD) / 84));
  const ticks: { x: number; label: string }[] = [];
  const d0 = new Date(viewStart);
  if (cfg.days === 365) {
    for (let m = 0; m < 14; m += Math.max(1, Math.ceil(12 / maxTicks))) {
      const tm = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + m, 1);
      if (tm >= viewStart && tm <= viewStart + span) ticks.push({ x: x(tm), label: fmtMonth(lang, tm, 'utc', false) });
    }
  } else {
    const every = Math.max(1, Math.ceil(cfg.days / maxTicks));
    for (let d = 0; d <= cfg.days; d += every) {
      const tm = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() + 1 + d);
      if (tm >= viewStart && tm <= viewStart + span) ticks.push({ x: x(tm), label: fmtDayMonth(lang, tm, tz) });
    }
  }
  const years: { x: number; label: string }[] = [];
  const yEvery = W < 520 ? 3 : 1;
  for (let y = new Date(eph.startMs).getUTCFullYear() + 1; Date.UTC(y, 0, 1) < eph.endMs; y += yEvery) years.push({ x: ox(Date.UTC(y, 0, 1)), label: fmtYear(lang, Date.UTC(y, 6, 1)) });

  const snap = cfg.days <= 30 ? 3_600_000 : DAY;
  const pxOf = (el: SVGSVGElement | null, e: RPE) => (el ? e.clientX - el.getBoundingClientRect().left : 0);
  const moveMain = (e: RPE) => {
    if (drag.current !== 'start' && drag.current !== 'end') return;
    const tm = Math.round(tAt(pxOf(main.current, e)) / snap) * snap;
    const c = Math.max(eph.startMs, Math.min(eph.endMs, tm));
    if (drag.current === 'start') set({ startMs: Math.min(c, endMs - DAY) });
    else set({ endMs: Math.max(c, startMs + DAY) });
  };
  const moveOver = (e: RPE) => { if (drag.current === 'window') setAnchor(otAt(pxOf(over.current, e)) - grab.current); };
  const stop = () => { drag.current = null; };
  const nudge = (k: number) => setAnchor(viewStart + k * span * 0.5);

  const xs = x(startMs), xe = x(endMs);
  const cw = (W - PAD) / cfg.cols;
  const ow = W / overview.sun.length;
  const winX = ox(viewStart), winW = Math.max(8, ox(viewStart + span) - winX);
  const MH = LH * 2 + 44;

  return (
    <div className="timeline">
      <div className="tl-head">
        <div className="seg" role="group" aria-label={t('tl.span')}>
          {SPANS.map((s, i) => <button key={s.key} type="button" aria-pressed={cfg === s} onClick={() => { setSpanIdx(i); setAnchor(null); }}>{t(s.key)}</button>)}
        </div>
        <div className="tl-nav" dir="ltr">
          <button type="button" className="icon-btn" aria-label={t('tl.earlier')} onClick={() => nudge(-1)}><Icon name="arrow" className="flip" /></button>
          <button type="button" className="icon-btn" aria-label={t('tl.later')} onClick={() => nudge(1)}><Icon name="arrow" /></button>
        </div>
      </div>
      <div ref={box} className="tl-box" dir="ltr">
        {W > 0 ? (
          <>
            <svg ref={main} width={W} height={MH} className="tl-svg" onPointerMove={moveMain} onPointerUp={stop} onPointerCancel={stop}>
              <text x={PAD - 10} y={26} textAnchor="end" className="tl-row">{t('tl.sun')}</text>
              <text x={PAD - 10} y={26 + LH + 4} textAnchor="end" className="tl-row">{t('tl.earth')}</text>
              {Array.from(rows.sun, (v, c) => <rect key={`s${c}`} x={PAD + c * cw} y={8} width={cw + 0.4} height={LH - 4} fill={sunColor(v)} />)}
              {Array.from(rows.earth, (v, c) => <rect key={`e${c}`} x={PAD + c * cw} y={8 + LH + 4} width={cw + 0.4} height={LH - 4} fill={earthColor(v)} />)}
              <rect x={Math.max(PAD, xs)} y={3} width={Math.max(0, Math.min(W, xe) - Math.max(PAD, xs))} height={LH * 2 + 10} className="tl-range" />
              {ticks.map((k) => <text key={k.x} x={k.x} y={MH - 8} textAnchor="middle" className="tick">{k.label}</text>)}
              {([['start', xs, 'tl.start'], ['end', xe, 'tl.end']] as const).map(([which, px, label]) => (px >= PAD - 1 && px <= W + 1 ? (
                <g key={which} className="tl-handle" role="slider" aria-label={t(label)} aria-valuetext={fmtDayMonth(lang, which === 'start' ? startMs : endMs, tz)} tabIndex={0}
                  onKeyDown={(e) => {
                    const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                    if (!k) return;
                    e.preventDefault();
                    if (which === 'start') set({ startMs: Math.min(endMs - DAY, Math.max(eph.startMs, startMs + k * DAY)) });
                    else set({ endMs: Math.max(startMs + DAY, Math.min(eph.endMs, endMs + k * DAY)) });
                  }}
                  onPointerDown={(e) => { drag.current = which; main.current?.setPointerCapture?.(e.pointerId); }}>
                  <rect x={px - 16} y={0} width={32} height={LH * 2 + 16} fill="transparent" />
                  <line x1={px} x2={px} y1={0} y2={LH * 2 + 16} />
                  <rect x={px - 7} y={LH - 8} width={14} height={28} rx={7} />
                </g>
              ) : null))}
            </svg>
            <svg ref={over} width={W} height={56} className="tl-over" onPointerMove={moveOver} onPointerUp={stop} onPointerCancel={stop}
              onPointerDown={(e) => {
                const px = pxOf(over.current, e);
                drag.current = 'window';
                const inside = px >= winX && px <= winX + winW;
                grab.current = inside ? otAt(px) - viewStart : span / 2;
                if (!inside) setAnchor(otAt(px) - span / 2);
                over.current?.setPointerCapture?.(e.pointerId);
              }}>
              {Array.from(overview.sun, (v, c) => <rect key={`os${c}`} x={c * ow} y={4} width={ow + 0.4} height={11} fill={sunColor(v)} />)}
              {Array.from(overview.earth, (v, c) => <rect key={`oe${c}`} x={c * ow} y={17} width={ow + 0.4} height={11} fill={earthColor(v)} />)}
              <rect x={ox(startMs)} y={2} width={Math.max(2, ox(endMs) - ox(startMs))} height={28} className="tl-o-mission" />
              <rect x={winX} y={0.5} width={winW} height={31} rx={6} className="tl-o-window" />
              {years.map((y) => <text key={y.label} x={y.x} y={52} textAnchor="middle" className="tick">{y.label}</text>)}
            </svg>
          </>
        ) : null}
      </div>
      <div className="tl-legend">
        <span><i className="sw sun" />{t('tl.sunUp')}</span>
        <span><i className="sw earth" />{t('tl.earthUp')}</span>
        <span><i className="sw night" />{t('tl.neither')}</span>
      </div>
    </div>
  );
}
