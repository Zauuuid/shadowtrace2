/** Planner steps 5 (result) and 6 (report). */
import { useLayoutEffect, useRef, useState } from 'react';
import type { PlannerData } from '../data/data';
import type { Analysis } from '../hooks/useAnalysis';
import { hours, type Run } from '../planner/mission';
import { distanceAz } from '../planner/polar';
import { BRAND, dirName, fmtDate, fmtDuration, fmtKm, fmtLatLon, fmtNum, translate, useT, type Key, type T } from '../i18n';
import { outageRows } from '../state/outages';
import { encodeMission } from '../state/share';
import { usePlanner } from '../state/store';
import { Icon } from '../ui/Icon';
import { InfoDrawer } from '../ui/InfoDrawer';
import { LogoMark } from '../ui/Logo';
import { SeriesChart } from './charts';
import { REPORT } from './report.en';
import { AltSites, Title } from './steps';
import { Timeline } from './Timeline';
import { verdictSentences } from './verdict';
import { Loading, Status, type Tone } from './widgets';

const HOUR = 3_600_000;
const VERDICT: Record<Analysis['status'], { k: Key; tone: Tone }> = {
  suitable: { k: 'verdict.suitable', tone: 'ok' }, rejected: { k: 'verdict.notSuitable', tone: 'bad' }, insufficient: { k: 'verdict.insufficient', tone: 'nodata' },
};

// ---------------------------------------------------------------- 5 · Result
export function ResultStep({ data, a, busy }: { data: PlannerData; a: Analysis | null; busy: boolean }) {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const site = usePlanner((s) => s.site);
  const limits = usePlanner((s) => s.limits);
  const [drawer, setDrawer] = useState(false);
  if (!a) return <section className="result"><Title k="result.q" /><Loading label={t('state.checking')} /></section>;
  const m = 'kind' in a.mission ? null : a.mission;
  const v = VERDICT[a.status];
  const fails = (code: string) => a.reasons.some((r) => r.code === code);
  return (
    <section className="result">
      <Title k="result.q" />
      <div className={`verdict ${v.tone}${busy ? ' busy' : ''}`} aria-live="polite">
        <p className="v-word"><Icon name={v.tone === 'ok' ? 'check' : v.tone === 'bad' ? 'cross' : 'info'} size={36} />{t(v.k)}</p>
        <ul className="v-sent">{verdictSentences(t, a, lang).map((s) => <li key={s}>{s}</li>)}</ul>
      </div>

      {m ? (
        <div className="trio">
          <Status tone={fails('battery') ? 'bad' : 'ok'}>{m.longestDark ? t('item.light', { d: fmtDuration(lang, hours(m.longestDark)) }) : t('item.lightNone')}</Status>
          <Status tone={fails('blackout') ? 'bad' : 'ok'}>{m.longestBlackout ? t('item.earth', { d: fmtDuration(lang, hours(m.longestBlackout)) }) : t('item.earthNone')}</Status>
          <Status tone={fails('battery') ? 'bad' : 'ok'}>{t('item.battery', { d: fmtDuration(lang, m.batteryHours) })}</Status>
        </div>
      ) : null}

      {a.status === 'rejected' && !busy ? <div className="block"><AltSites data={data} a={a} busy={busy} /></div> : null}

      {m ? (
        <>
          <div className="block">
            <h2 className="subtitle">{t('result.timeline')}</h2>
            <Timeline eph={data.eph} horizon={a.horizon} site={site} />
          </div>
          <div className="block">
            <h2 className="subtitle">{t('result.chart')}</h2>
            <div className="charts">
              {(['sun', 'earth', 'soc'] as const).map((k) => <SeriesChart key={k} m={m} kind={k} minEarth={limits.minEarthElDeg} />)}
            </div>
          </div>
        </>
      ) : null}
      <button type="button" className="btn-text details" onClick={() => setDrawer(true)}><Icon name="info" />{t('result.details')}</button>
      {drawer ? <InfoDrawer onClose={() => setDrawer(false)} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- 6 · Report (English only, one A4 page)
const R = (k: keyof typeof REPORT, vars?: Record<string, string | number>) =>
  vars ? REPORT[k].replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? '')) : REPORT[k];
const PAGE_W = 560, PAGE_H = Math.round((560 * 297) / 210);

export function ReportStep({ data, a }: { data: PlannerData; a: Analysis | null }) {
  const t = useT();
  const tz = usePlanner((s) => s.tz);
  const site = usePlanner((s) => s.site);
  const dispersion = usePlanner((s) => s.dispersion);
  const startMs = usePlanner((s) => s.startMs);
  const endMs = usePlanner((s) => s.endMs);
  const craft = usePlanner((s) => s.craft);
  const limits = usePlanner((s) => s.limits);
  const [copied, setCopied] = useState<'ok' | 'manual' | null>(null);
  const [now] = useState(() => Date.now());
  const fit = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const measure = () => {
      const el = fit.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top - (el.closest('.planner')?.getBoundingClientRect().top ?? 0);
      const bar = document.querySelector('.pnav')?.getBoundingClientRect().height ?? 88;
      const availH = window.innerHeight - top - bar - 96;
      setScale(Math.min(1, el.clientWidth / PAGE_W, Math.max(0.3, availH / PAGE_H)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const tEn: T = (k, vars) => translate('en', k, vars);
  const link = `${location.origin}${location.pathname}${encodeMission({ site, dispersion, startMs, endMs, craft, limits })}`;
  const near = data.names.map((n) => ({ n, d: distanceAz(site, n) })).sort((x, y) => x.d.m - y.d.m)[0];
  const m = a && !('kind' in a.mission) ? a.mission : null;
  const v = a ? VERDICT[a.status] : null;
  const d = (ms: number) => fmtDate('en', ms, tz);
  const ranges = (runs: readonly Run[]) => outageRows(runs, 3).rows.map((r) => (
    <li key={r.startMs}>{R('range', { a: d(r.startMs), b: d(r.endMs), n: fmtDuration('en', (r.endMs - r.startMs) / HOUR) })}</li>
  ));
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied('ok'); } catch { setCopied('manual'); } };

  return (
    <section className="report-step">
      <Title k="report.q" />
      <div className="report-fit" ref={fit} style={{ height: PAGE_H * scale }}>
        <article className="report" lang="en" dir="ltr" aria-label={t('report.label')} style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})` }}>
          <header className="rp-head">
            <div className="rp-brand"><LogoMark size={26} /><b>{BRAND}</b></div>
            <div className="rp-meta"><b>{R('title')}</b><span>{R('generated', { d: d(now) })}</span></div>
          </header>
          <div className={`rp-verdict ${v?.tone ?? ''}`}>
            <p className="rp-word">{v ? tEn(v.k) : R('pending')}</p>
            {a ? <ul>{verdictSentences(tEn, a, 'en').map((s) => <li key={s}>{s}</li>)}</ul> : null}
          </div>
          <table className="rp-table">
            <tbody>
              <tr><th>{R('site')}</th><td>{fmtLatLon(site.lat, site.lon)}</td></tr>
              <tr><th>{R('nearest')}</th><td>{near ? R('nearestValue', { name: near.n.name, d: fmtKm('en', near.d.m), dir: dirName('en', near.d.az) }) : '—'}</td></tr>
              <tr><th>{R('dates')}</th><td>{R('datesValue', { a: d(startMs), b: d(endMs), n: fmtDuration('en', (endMs - startMs) / HOUR) })}</td></tr>
              <tr><th>{R('craft')}</th><td>{R('craftValue', { b: fmtNum('en', craft.batteryWh), a: fmtNum('en', craft.arrayAreaM2, 1), e: fmtNum('en', craft.arrayEff * 100, 1) })}</td></tr>
              <tr><th>{R('ellipse')}</th><td>{R('ellipseValue', { l: fmtNum('en', dispersion.northM + dispersion.southM), w: fmtNum('en', dispersion.eastM + dispersion.westM) })}</td></tr>
            </tbody>
          </table>
          <div className="rp-two">
            <div><h3>{R('sun')}</h3>{m && m.darkRuns.length ? <ul>{ranges(m.darkRuns)}</ul> : <p>{m ? R('none') : R('pending')}</p>}</div>
            <div><h3>{R('earth')}</h3>{m && m.blackoutRuns.length ? <ul>{ranges(m.blackoutRuns)}</ul> : <p>{m ? R('none') : R('pending')}</p>}</div>
          </div>
          <footer className="rp-src"><h3>{R('sources')}</h3><p>{R('sourcesValue')}</p></footer>
        </article>
      </div>
      <div className="actions no-print">
        <button type="button" className="btn-primary" onClick={() => window.print()}>{t('report.print')}</button>
        <button type="button" className="btn-text" onClick={copy}>{copied === 'ok' ? t('report.copied') : t('report.copy')}</button>
      </div>
      {copied === 'manual' ? <input className="field link-box no-print" readOnly dir="ltr" value={link} onFocus={(e) => e.currentTarget.select()} autoFocus /> : null}
    </section>
  );
}
