/** Planner steps 1–4. One short question per screen, few inputs, no explanatory text. No science maths here. */
import { useState } from 'react';
import type { PlannerData } from '../data/data';
import { useAlternatives } from '../hooks/useAlternatives';
import type { Analysis } from '../hooks/useAnalysis';
import type { AltReason } from '../planner/alternatives';
import { toLatLon } from '../planner/polar';
import { dirName, fmtKm, fmtNum, translate, useT, type Key } from '../i18n';
import { MAX_BATTERY_WH } from '../state/share';
import { DAY, usePlanner } from '../state/store';
import { siteStatus } from '../state/tones';
import { verdictSentences } from './verdict';
import { Icon } from '../ui/Icon';
import { DatePicker } from './DatePicker';
import { MoonMap } from './MoonMap';
import { Loading, NumberField, OutageList, Status } from './widgets';

export function Title({ k }: { k: Key }) {
  const t = useT();
  return <h1 className="title" tabIndex={-1}>{t(k)}</h1>;
}

// ---------------------------------------------------------------- 1 · Dates
export function DatesStep({ data }: { data: PlannerData }) {
  const t = useT();
  const startMs = usePlanner((s) => s.startMs);
  const endMs = usePlanner((s) => s.endMs);
  const set = usePlanner((s) => s.set);
  const days = Math.max(1, Math.round((endMs - startMs) / DAY));
  const maxDays = (s: number) => Math.max(1, Math.floor((data.eph.endMs - s) / DAY));
  return (
    <section className="dates">
      <Title k="dates.q" />
      <div className="fields two">
        <DatePicker label={t('dates.start')} valueMs={startMs} min={data.eph.startMs} max={data.eph.endMs - DAY}
          onChange={(v) => set({ startMs: v, endMs: v + Math.min(days, maxDays(v)) * DAY })} />
        <NumberField id="f-days" label={t('dates.duration')} unit={t('unit.daysShort')} value={days} step={1} min={1} max={maxDays(startMs)}
          onChange={(n) => set({ endMs: startMs + n * DAY })} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 2 · Spacecraft
type Row = 'battery' | 'solar';
export function CraftStep() {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const craft = usePlanner((s) => s.craft);
  const setCraft = usePlanner((s) => s.setCraft);
  const [open, setOpen] = useState<Row | null>(null);
  const rows: { id: Row; title: Key; summary: string }[] = [
    { id: 'battery', title: 'craft.battery', summary: t('unit.wh', { n: fmtNum(lang, craft.batteryWh) }) },
    { id: 'solar', title: 'craft.solar', summary: `${t('unit.m2', { n: fmtNum(lang, craft.arrayAreaM2, 1) })} · ${t('unit.pct', { n: fmtNum(lang, craft.arrayEff * 100, 1) })}` },
  ];
  return (
    <section className="craft">
      <Title k="craft.q" />
      <div className="acc">
        {rows.map((r) => {
          const on = open === r.id;
          return (
            <div key={r.id} className={on ? 'acc-row open' : 'acc-row'}>
              <button type="button" className="acc-head" aria-expanded={on} aria-controls={`acc-${r.id}`} onClick={() => setOpen(on ? null : r.id)}>
                <span className="acc-title">{t(r.title)}</span>
                <bdi className="acc-sum">{r.summary}</bdi>
                <span className="acc-icon"><Icon name={on ? 'minus' : 'plus'} /></span>
              </button>
              <div className="acc-body" id={`acc-${r.id}`} inert={!on}><div><div className="acc-in">
                {r.id === 'battery' ? (
                  <NumberField id="f-bat" label={t('craft.capacity')} unit={t('unit.whShort')} value={craft.batteryWh} step={100} min={50} max={MAX_BATTERY_WH} onChange={(v) => setCraft({ batteryWh: v })} />
                ) : (
                  <div className="fields two">
                    <NumberField id="f-area" label={t('craft.area')} unit={t('unit.m2Short')} value={craft.arrayAreaM2} step={0.1} min={0.1} max={50} digits={1} onChange={(v) => setCraft({ arrayAreaM2: v })} />
                    <NumberField id="f-eff" label={t('craft.eff')} unit={t('unit.pctShort')} value={Math.round(craft.arrayEff * 1000) / 10} step={0.5} min={1} max={45} digits={1} onChange={(v) => setCraft({ arrayEff: v / 100 })} />
                  </div>
                )}
              </div></div></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 3 · Site
export function suitMonthOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function CoordField({ id, label, hint, value, ok, onCommit }: { id: string; label: string; hint: string; value: number; ok: (v: number) => boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const v = text === null ? value : Number(text.replace('−', '-').replace(',', '.'));
  const bad = text !== null && (text.trim() === '' || !Number.isFinite(v) || !ok(v));
  const commit = () => { if (text !== null && !bad) onCommit(v); if (!bad) setText(null); };
  return (
    <div className="nf">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="field" inputMode="decimal" dir="ltr" aria-invalid={bad} aria-describedby={bad ? `${id}-h` : undefined}
        value={text ?? value.toFixed(4)} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      {bad ? <p className="nf-max" id={`${id}-h`}>{hint}</p> : null}
    </div>
  );
}

function siteProblem(a: Analysis, reasons: readonly { code: string }[]): Key {
  const m = 'kind' in a.mission ? null : a.mission;
  const bat = reasons.some((r) => r.code === 'battery'), blk = reasons.some((r) => r.code === 'blackout');
  if (bat && blk) return 'site.both';
  if (bat) return m && m.sunVisiblePct < 0.5 ? 'site.noSun' : 'site.battery';
  return m && m.earthVisiblePct < 0.5 ? 'site.noEarth' : 'site.blackout';
}

export function SiteStep({ data, a, busy }: { data: PlannerData; a: Analysis | null; busy: boolean }) {
  const t = useT();
  const site = usePlanner((s) => s.site);
  const startMs = usePlanner((s) => s.startMs);
  const set = usePlanner((s) => s.set);
  const minLat = data.terrain.minLatDeg;
  const m = a && !busy && !('kind' in a.mission) ? a.mission : null;
  const s3 = a ? siteStatus(a.reasons, 'kind' in a.mission) : null;
  return (
    <section className="site">
      <Title k="site.q" />
      <div className="split">
        <MoonMap data={data} site={site} onPick={(p) => set({ site: p })} suitMonth={suitMonthOf(startMs)} />
        <div className="side">
          <div className="fields two">
            <CoordField id="f-lat" label={t('site.lat')} hint={t('site.latHint')} value={site.lat} ok={(v) => v <= minLat && v >= -90} onCommit={(lat) => set({ site: { lat, lon: site.lon } })} />
            <CoordField id="f-lon" label={t('site.lon')} hint={t('site.lonHint')} value={site.lon} ok={(v) => v >= -180 && v <= 180} onCommit={(lon) => set({ site: { lat: site.lat, lon } })} />
          </div>
          <div className="site-status" aria-live="polite">
            {!a || busy || !s3 ? <Loading label={t('state.checking')} /> : s3.status === 'good' ? <Status tone="ok">{t('site.good')}</Status>
              : s3.status === 'insufficient' ? <Status tone="nodata">{verdictSentences(t, a)[0]}</Status> : (
                <>
                  <Status tone="bad">{t(siteProblem(a, s3.reasons))}</Status>
                  <AltSites data={data} a={a} busy={busy} />
                </>
              )}
          </div>
          {m ? <div className="out-pair"><OutageList runs={m.darkRuns} kind="sun" /><OutageList runs={m.blackoutRuns} kind="earth" /></div> : null}
        </div>
      </div>
    </section>
  );
}

const NONE_KEY: Record<AltReason, Key> = { battery: 'alt.none.battery', blackout: 'alt.none.blackout', slope: 'alt.none.slope', light: 'alt.none.light' };

/** Only fully suitable sites (§8), nearest first, tap to apply; or one sentence saying why there are none. */
export function AltSites({ data, a, busy }: { data: PlannerData; a: Analysis; busy: boolean }) {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const set = usePlanner((s) => s.set);
  const { sites, searching, reason } = useAlternatives(data, a, busy, true);
  return (
    <div className="alts">
      {sites.length ? <h2 className="label">{t('alt.title')}</h2> : null}
      {sites.length ? (
        <ul>
          {sites.map((x) => {
            const d = fmtKm(lang, x.distanceM), dir = dirName(lang, x.azDeg);
            return (
              <li key={`${x.site.lat},${x.site.lon}`}>
                <button type="button" className="alt" aria-label={t('alt.use', { d, dir })} onClick={() => { set({ site: x.site }); document.querySelector('.page.planner')?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <Icon name="locate" /><span>{translate(lang, 'alt.item', { d, dir })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {searching ? <Loading label={t('alt.searching')} /> : !sites.length && reason ? <p className="quiet">{t(NONE_KEY[reason])}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- 4 · Landing ellipse
export function EllipseStep({ data, a, busy }: { data: PlannerData; a: Analysis | null; busy: boolean }) {
  const t = useT();
  const site = usePlanner((s) => s.site);
  const d = usePlanner((s) => s.dispersion);
  const set = usePlanner((s) => s.set);
  const landing = busy ? undefined : a?.landing; // never the previous site's result
  const length = d.northM + d.southM, width = d.eastM + d.westM;
  return (
    <section className="ellipse">
      <Title k="ellipse.q" />
      <div className="split">
        <MoonMap data={data} site={site} onPick={(p) => set({ site: p })} dispersion={d} />
        <div className="side">
          <div className="fields">
            <NumberField id="f-len" label={t('ellipse.length')} unit={t('unit.mShort')} value={length} step={10} min={10} max={10_000}
              onChange={(v) => set({ dispersion: { ...d, northM: v / 2, southM: v / 2 } })} />
            <NumberField id="f-wid" label={t('ellipse.width')} unit={t('unit.mShort')} value={width} step={10} min={10} max={10_000}
              onChange={(v) => set({ dispersion: { ...d, eastM: v / 2, westM: v / 2 } })} />
          </div>
          <div className="site-status" aria-live="polite">
            {!landing ? <Loading label={t('state.checking')} /> : landing.samples === 0 ? <Status tone="nodata">{t('ellipse.noData')}</Status>
              : landing.safe ? <Status tone="ok">{t('ellipse.flat')}</Status> : (
                <>
                  <Status tone="bad">{t('ellipse.steep')}</Status>
                  {landing.suggestion ? (
                    <button type="button" className="btn-secondary" onClick={() => set({ site: toLatLon(landing.suggestion!.aim) })}><Icon name="locate" />{t('ellipse.move')}</button>
                  ) : <p className="quiet">{t('ellipse.noSafe')}</p>}
                </>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}
