/** Navbar: logo, time-zone toggle, language toggle, sources button. Under it, in the planner, six progress dots. */
import { BRAND, LANG_NAMES, useT } from '../i18n';
import { saveLang } from '../state/lang';
import { usePlanner, type Step } from '../state/store';
import { Icon } from './Icon';
import { LogoMark } from './Logo';

export function TzToggle() {
  const t = useT();
  const tz = usePlanner((s) => s.tz);
  const set = usePlanner((s) => s.set);
  return (
    <div className="seg" role="group" aria-label={t('nav.tz')}>
      {(['utc', 'ksa'] as const).map((z) => <button key={z} type="button" aria-pressed={tz === z} onClick={() => set({ tz: z })}>{t(z === 'utc' ? 'tz.utc' : 'tz.ksa')}</button>)}
    </div>
  );
}

export function Header({ onInfo }: { onInfo: () => void }) {
  const t = useT();
  const lang = usePlanner((s) => s.lang);
  const page = usePlanner((s) => s.page);
  const set = usePlanner((s) => s.set);
  return (
    <header className={page === 2 ? 'top solid' : 'top'}>
      <div className="top-row">
        <button type="button" className="brand" onClick={() => set({ page: 0 })} aria-label={t('nav.home')}>
          <LogoMark /><span className="wordmark" dir="ltr">{BRAND}</span>
        </button>
        <div className="top-ctl">
          <div className="hide-sm"><TzToggle /></div>
          <div className="seg" role="group" aria-label={t('nav.lang')}>
            {(['en', 'ar'] as const).map((l) => (
              <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => { saveLang(l); set({ lang: l }); }}>{LANG_NAMES[l]}</button>
            ))}
          </div>
          <button type="button" className="icon-btn" aria-label={t('nav.info')} onClick={onInfo}><Icon name="info" size={22} /></button>
        </div>
      </div>
      {page === 2 ? <Dots /> : null}
    </header>
  );
}

function Dots() {
  const t = useT();
  const step = usePlanner((s) => s.step);
  const set = usePlanner((s) => s.set);
  return (
    <nav className="dots" aria-label={t('progress')}>
      {([1, 2, 3, 4, 5, 6] as Step[]).map((n) => (
        <button key={n} type="button" className={n === step ? 'dot now' : n < step ? 'dot done' : 'dot'} disabled={n > step}
          aria-current={n === step ? 'step' : undefined} aria-label={t('progress.step', { n })} onClick={() => set({ step: n })}>
          <i />
        </button>
      ))}
    </nav>
  );
}
