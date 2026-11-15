/** Small shared pieces of the planner: number field with − / +, status line, outage list, loading line. */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Run } from '../planner/mission';
import { fmtDate, fmtDuration, fmtNum, translate, useT } from '../i18n';
import { clamp, parseNumber } from '../state/number';
import { outageRows } from '../state/outages';
import { usePlanner } from '../state/store';
import { Icon, type IconName } from '../ui/Icon';

export type Tone = 'ok' | 'warn' | 'bad' | 'nodata';
const TONE_ICON: Record<Tone, IconName> = { ok: 'check', warn: 'info', bad: 'cross', nodata: 'info' };

/** Status = icon + words, coloured by tone (never colour alone). */
export function Status({ tone, children, big }: { tone: Tone; children: ReactNode; big?: boolean }) {
  return <p className={`status ${tone}${big ? ' big' : ''}`}><Icon name={TONE_ICON[tone]} size={big ? 28 : 20} /><span>{children}</span></p>;
}

export function NumberField({ label, unit, value, min, max, step, digits = 0, onChange, id }: {
  label: string; unit: string; value: number; min: number; max: number; step: number; digits?: number; onChange: (v: number) => void; id: string;
}) {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const [text, setText] = useState<string | null>(null);
  const [hit, setHit] = useState(false);
  const commit = (raw: number) => {
    const c = clamp(Math.round(raw * 10 ** digits) / 10 ** digits, min, max);
    setHit(c.clamped && raw > max);
    onChange(c.value);
  };
  return (
    <div className="nf">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="nf-row">
        <button type="button" className="nf-btn" aria-label={t('field.less', { x: label })} onClick={() => { setText(null); commit(value - step); }}><Icon name="minus" /></button>
        <div className="nf-val">
          <input id={id} inputMode="decimal" dir="ltr" value={text ?? fmtNum('en', value, digits)}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => { const v = text === null ? null : parseNumber(text); if (v !== null) commit(v); setText(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          <span className="nf-unit">{unit}</span>
        </div>
        <button type="button" className="nf-btn" aria-label={t('field.more', { x: label })} onClick={() => { setText(null); commit(value + step); }}><Icon name="plus" /></button>
      </div>
      {hit ? <p className="nf-max" role="status">{t('field.max', { v: `${fmtNum(lang, max)} ${unit}` })}</p> : null}
    </div>
  );
}

const HOUR = 3_600_000;
/** Date ranges without hours: "12 Jan 2027 → 19 Jan 2027 · 7 days". The longest `max`, in time order. */
export function OutageList({ runs, kind, max = 3 }: { runs: readonly Run[]; kind: 'sun' | 'earth'; max?: number }) {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const tz = usePlanner((s) => s.tz);
  const { rows } = outageRows(runs, max);
  return (
    <div className={`outages ${kind}`}>
      <h3 className="label">{t(kind === 'sun' ? 'out.sun' : 'out.earth')}</h3>
      {rows.length === 0 ? <p className="quiet">{t('out.none')}</p> : (
        <ul>
          {rows.map((r) => (
            <li key={r.startMs}>
              <span>{translate(lang, 'out.range', { a: fmtDate(lang, r.startMs, tz), b: fmtDate(lang, r.endMs, tz) })}</span>
              <b>{fmtDuration(lang, (r.endMs - r.startMs) / HOUR)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return <p className="loading" role="status" aria-live="polite"><span className="pulse" aria-hidden="true" />{label}</p>;
}

/** Width of an element in CSS pixels, so charts draw at 1 unit = 1 px and their text stays at the fixed sizes. */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    setW(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
