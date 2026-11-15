/**
 * "The mission, step by step": one chart per factor, drawn from the engine's MissionResult arrays at the real pixel
 * width (so its text keeps the fixed type sizes). sun = Sun above the terrain horizon (shaded = dark), earth = Earth
 * above the horizon (hatched = no contact), battery = state of charge (red line = empty). Time runs left → right.
 */
import { useId } from 'react';
import type { MissionResult } from '../planner/mission';
import { fmtDayMonth, fmtMonth, fmtNum, fmtYear, useT, type Key } from '../i18n';
import { tickPlan } from '../state/format';
import { usePlanner } from '../state/store';
import { useWidth } from './widgets';

export type Factor = 'sun' | 'earth' | 'soc';
const LABEL: Record<Factor, Key> = { sun: 'chart.sun', earth: 'chart.earth', soc: 'chart.battery' };

export function SeriesChart({ m, kind, minEarth }: { m: MissionResult; kind: Factor; minEarth: number }) {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const tz = usePlanner((s) => s.tz);
  const [ref, W] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/:/g, '');
  const height = 150, P = 44, TOP = 8, H = height - 34;
  const n = m.t.length;
  const x = (i: number) => P + (i / Math.max(1, n - 1)) * (W - P - 8);
  const vals = new Float32Array(n);
  for (let i = 0; i < n; i++) vals[i] = kind === 'sun' ? m.sunMargin[i]! : kind === 'earth' ? m.earthMargin[i]! : m.usableWh > 0 ? (100 * m.socWh[i]!) / m.usableWh : 0;
  let lo = 0, hi = kind === 'soc' ? 100 : 1;
  if (kind !== 'soc') {
    for (const v of vals) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    lo = Math.max(-10, Math.floor(lo)); hi = Math.min(15, Math.ceil(hi));
  }
  const y = (v: number) => TOP + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * H;
  const stride = Math.max(1, Math.floor(n / Math.max(100, W)));
  let d = '';
  for (let i = 0; i < n; i += stride) d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(vals[i]!).toFixed(1)}`;
  d += `L${x(n - 1).toFixed(1)},${y(vals[n - 1]!).toFixed(1)}`;

  const bands: [number, number][] = [];
  if (kind !== 'soc') {
    let s = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && (kind === 'sun' ? m.sunFrac[i]! <= 0 : m.earthMargin[i]! < minEarth);
      if (on && s < 0) s = i;
      if (!on && s >= 0) { bands.push([s, i - 1]); s = -1; }
    }
  }
  const plan = tickPlan((m.t[n - 1]! - m.t[0]!) / 86_400_000);
  const maxTicks = Math.max(2, Math.floor((W - P) / 90));
  const ticks: { x: number; label: string }[] = [];
  const d0 = new Date(m.t[0]!);
  for (let k = 0; k < 400 && ticks.length < maxTicks; k++) {
    const every = plan.every * (plan.unit === 'day' ? Math.max(1, Math.ceil(((m.t[n - 1]! - m.t[0]!) / 86_400_000) / maxTicks / plan.every)) : 1);
    const tm = plan.unit === 'day' ? Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() + 1 + k * every)
      : plan.unit === 'month' ? Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1 + k * plan.every, 1) : Date.UTC(d0.getUTCFullYear() + 1 + k, 0, 1);
    if (tm > m.t[n - 1]!) break;
    const label = plan.unit === 'day' ? fmtDayMonth(lang, tm, tz) : plan.unit === 'month' ? fmtMonth(lang, tm, 'utc', true) : fmtYear(lang, tm);
    ticks.push({ x: x((tm - m.t[0]!) / m.stepMs), label });
  }
  const deg = (v: number) => `${fmtNum(lang, v)}°`;
  return (
    <figure className={`chart-fig ${kind}`}>
      <figcaption className="label">{t(LABEL[kind])}</figcaption>
      <div ref={ref} className="chart-box">
        {W > 0 ? (
          <svg width={W} height={height} className="chart" role="img" aria-label={t(LABEL[kind])}>
            <defs>
              <pattern id={`h${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" className="hatch" /></pattern>
            </defs>
            {bands.map(([a, b]) => <rect key={a} x={x(a)} y={TOP} width={Math.max(1, x(b) - x(a))} height={H} className={kind === 'sun' ? 'band-dark' : 'band-out'} fill={kind === 'earth' ? `url(#h${uid})` : undefined} />)}
            <line x1={P} x2={W - 8} y1={TOP + H} y2={TOP + H} className="axis" />
            <line x1={P} x2={W - 8} y1={y(0)} y2={y(0)} className={kind === 'soc' ? 'ref bad' : 'ref'} />
            {kind === 'earth' && minEarth !== 0 ? <line x1={P} x2={W - 8} y1={y(minEarth)} y2={y(minEarth)} className="ref dash" /> : null}
            <text x={P - 8} y={y(hi) + 5} className="tick" textAnchor="end">{kind === 'soc' ? t('unit.pct', { n: fmtNum(lang, 100) }) : deg(hi)}</text>
            <text x={P - 8} y={y(lo) + 5} className="tick" textAnchor="end">{kind === 'soc' ? t('unit.pct', { n: fmtNum(lang, 0) }) : deg(lo)}</text>
            <path d={d} className={`series ${kind}`} />
            {ticks.map((k) => <text key={k.x} x={k.x} y={height - 6} className="tick" textAnchor="middle">{k.label}</text>)}
          </svg>
        ) : null}
      </div>
    </figure>
  );
}
