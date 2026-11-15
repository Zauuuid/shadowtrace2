/** Shell: navbar, the two hook pages over the Moon, and the planner as the third page (loaded on demand). */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { prefetchEphemeris } from './data/data';
import { useT } from './i18n';
import { HookPage, MoonLayer } from './journey/Journey';
import { useSnap } from './journey/useSnap';
import { routeLang } from './state/lang';
import { usePlanner } from './state/store';
import { Header } from './ui/Header';
import { InfoDrawer } from './ui/InfoDrawer';

const loadPlanner = () => import('./planner-ui/Planner');
const Planner = lazy(loadPlanner);

function useLangRoute(): void {
  const lang = usePlanner((s) => s.lang);
  const t = useT();
  useEffect(() => {
    const read = () => {
      const l = routeLang(location.hash);
      if (l && l !== usePlanner.getState().lang) usePlanner.setState({ lang: l });
    };
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = t('meta.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
    if (routeLang(location.hash) !== lang) history.replaceState(null, '', `${location.pathname}${location.search}#/${lang}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
}

/** Planner code and data start loading only when the planner is near, or after 3 s of idle (ephemeris first). */
function usePrefetch(): boolean {
  const page = usePlanner((s) => s.page);
  const [want, setWant] = useState(page > 0);
  if (page > 0 && !want) setWant(true);
  useEffect(() => {
    const id = setTimeout(() => {
      const ric = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => f());
      ric(() => { void loadPlanner(); void prefetchEphemeris().catch(() => undefined); });
    }, 3000);
    return () => clearTimeout(id);
  }, []);
  return want;
}

export function App() {
  useLangRoute();
  const t = useT();
  const page = usePlanner((s) => s.page);
  const set = usePlanner((s) => s.set);
  const [drawer, setDrawer] = useState(false);
  const planner = useRef<HTMLDivElement>(null);
  const want = usePrefetch();
  useSnap(planner);

  return (
    <div className="app" onScroll={(e) => { e.currentTarget.scrollTop = 0; }}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); set({ page: 2 }); }}>{t('meta.skip')}</a>
      <MoonLayer />
      <div className="track" style={{ '--page': page } as React.CSSProperties}>
        <HookPage n={0} active={page === 0} />
        <HookPage n={1} active={page === 1} />
        <div className="page planner" ref={planner} inert={page !== 2} aria-hidden={page !== 2}>
          {want ? <Suspense fallback={<p className="loading" role="status">{t('state.loading')}</p>}><Planner scroller={planner} /></Suspense> : null}
        </div>
      </div>
      <Header onInfo={() => setDrawer(true)} />
      {drawer ? <InfoDrawer onClose={() => setDrawer(false)} /> : null}
    </div>
  );
}
