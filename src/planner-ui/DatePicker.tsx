/**
 * Date picker: year → month → day, no time. A popover on wide screens, a bottom sheet on phones. Picking a day sets
 * noon of that day in the chosen time zone. Days outside [min, max] (the loaded JPL Horizons range) are disabled.
 */
import { useEffect, useRef, useState } from 'react';
import { dayParts, fmtDate, monthNames, useT, weekdayInitials } from '../i18n';
import { usePlanner, type Tz } from '../state/store';
import { Sheet } from '../ui/Sheet';

const OFF: Record<Tz, number> = { utc: 0, ksa: 3 * 3_600_000 };
const DAY = 86_400_000;
const toMs = (y: number, m: number, d: number, tz: Tz) => Date.UTC(y, m, d, 12) - OFF[tz];

interface Props {
  readonly label: string;
  readonly valueMs: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (ms: number) => void;
}

export function DatePicker({ label, valueMs, min, max, onChange }: Props) {
  const lang = usePlanner((s) => s.lang);
  const tz = usePlanner((s) => s.tz);
  const [open, setOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || narrow) return;
    const onDoc = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, narrow]);

  const toggle = () => { setNarrow(window.matchMedia('(max-width: 640px)').matches); setOpen(!open); };
  const pick = (ms: number) => { onChange(Math.max(min, Math.min(max, ms))); setOpen(false); };
  const body = <Calendar valueMs={valueMs} min={min} max={max} onPick={pick} />;

  return (
    <div className="dp" ref={box}>
      <span className="label" id="dp-label">{label}</span>
      <button type="button" className="field dp-value" aria-expanded={open} aria-labelledby="dp-label dp-val" onClick={toggle}>
        <span id="dp-val">{fmtDate(lang, valueMs, tz)}</span>
      </button>
      {open && !narrow ? <div className="dp-pop" role="dialog" aria-label={label}>{body}</div> : null}
      {open && narrow ? <Sheet label={label} title={label} onClose={() => setOpen(false)}>{body}</Sheet> : null}
    </div>
  );
}

function Calendar({ valueMs, min, max, onPick }: { valueMs: number; min: number; max: number; onPick: (ms: number) => void }) {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const tz = usePlanner((s) => s.tz);
  const v = dayParts(valueMs, tz);
  const lo = dayParts(min, tz), hi = dayParts(max, tz);
  const [view, setView] = useState<'year' | 'month' | 'day'>('day');
  const [y, setY] = useState(v.y);
  const [m, setM] = useState(v.m);
  const months = monthNames(lang);
  const years: number[] = [];
  for (let k = lo.y; k <= hi.y; k++) years.push(k);
  const monthOk = (yy: number, mm: number) => Date.UTC(yy, mm + 1, 1) - OFF[tz] > min && Date.UTC(yy, mm, 1) - OFF[tz] <= max;
  const dayOk = (dd: number) => { const s = Date.UTC(y, m, dd) - OFF[tz]; return s + DAY > min && s <= max; };
  const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className={view === 'year' ? 'crumb on' : 'crumb'} aria-label={t('picker.year')} onClick={() => setView('year')}>{String(y)}</button>
        <button type="button" className={view === 'month' ? 'crumb on' : 'crumb'} aria-label={t('picker.month')} onClick={() => setView('month')}>{months[m]}</button>
      </div>
      {view === 'year' ? (
        <div className="cal-grid y" role="group" aria-label={t('picker.year')}>
          {years.map((yy) => <button key={yy} type="button" className={yy === v.y ? 'on' : ''} onClick={() => { setY(yy); setView('month'); }}>{String(yy)}</button>)}
        </div>
      ) : view === 'month' ? (
        <div className="cal-grid m" role="group" aria-label={t('picker.month')}>
          {months.map((name, mm) => (
            <button key={mm} type="button" disabled={!monthOk(y, mm)} className={y === v.y && mm === v.m ? 'on' : ''} onClick={() => { setM(mm); setView('day'); }}>{name}</button>
          ))}
        </div>
      ) : (
        <div className="cal-grid d" role="group" aria-label={t('picker.day')}>
          {weekdayInitials(lang).map((d, k) => <span key={k} className="dow" aria-hidden="true">{d}</span>)}
          {Array.from({ length: firstDow }, (_, k) => <span key={`e${k}`} />)}
          {Array.from({ length: daysIn }, (_, k) => {
            const dd = k + 1;
            return (
              <button key={dd} type="button" disabled={!dayOk(dd)} className={y === v.y && m === v.m && dd === v.d ? 'on' : ''}
                aria-label={fmtDate(lang, toMs(y, m, dd, tz), tz)} onClick={() => onPick(toMs(y, m, dd, tz))}>{String(dd)}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
