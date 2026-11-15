/**
 * The opening: two hook pages over a living Moon. First paint is a CSS poster of the NASA SVS colour map placed
 * exactly like the Moon (pose.ts); Three.js loads after first paint and fades in over it. With reduced motion or no
 * WebGL the poster stays, without animation.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useT } from '../i18n';
import { usePlanner, type Page } from '../state/store';
import { PAGE_MS, poseFor, sunOnScreen, SPIN_DEG_S, type Pose } from './pose';
import type { MoonHandle } from './moon';

const BASE = import.meta.env.BASE_URL;

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function useViewport(): { w: number; h: number } {
  const [v, setV] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

/** Poster disc: the colour map in a circle, centred on the facing longitude, shaded toward the Horizons Sun. */
function posterStyle(p: Pose, spin: boolean): CSSProperties {
  const u0 = 0.5 + p.lon / 360;
  const v0 = 0.5 - p.lat / 180;
  const s = sunOnScreen(p);
  const hx = 50 + s[0] * 34, hy = 50 - s[1] * 34;
  return {
    left: p.x - p.d / 2, top: p.y - p.d / 2, width: p.d, height: p.d,
    backgroundSize: `${2 * p.d}px ${p.d}px`,
    backgroundPosition: `${p.d / 2 - u0 * 2 * p.d}px ${p.d / 2 - v0 * p.d}px`,
    '--shade': `radial-gradient(circle at ${hx}% ${hy}%, rgba(7,10,16,0) 28%, rgba(7,10,16,.55) 58%, rgba(7,10,16,.97) 78%)`,
    '--spin-to': `${p.d / 2 - u0 * 2 * p.d + 2 * p.d}px`,
    '--spin-s': `${360 / SPIN_DEG_S}s`,
    animationPlayState: spin ? 'running' : 'paused',
  } as CSSProperties;
}

export function MoonLayer() {
  const t = useT();
  const page = usePlanner((s) => s.page);
  const lang = usePlanner((s) => s.lang);
  const rtl = lang === 'ar';
  const { w, h } = useViewport();
  const canvas = useRef<HTMLCanvasElement>(null);
  const moon = useRef<MoonHandle | null>(null);
  const [motion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches && webglOk());
  const [glReady, setGlReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // The canvas lives only while a hook page is shown (it is disposed under the planner).
  const [covered, setCovered] = useState(page === 2);
  useEffect(() => {
    const id = setTimeout(() => setCovered(page === 2), page === 2 ? PAGE_MS + 50 : 0);
    return () => clearTimeout(id);
  }, [page]);

  const live = motion && !failed && !covered;
  const hookPage: 0 | 1 = page === 0 ? 0 : 1;
  const pageRef = useRef(hookPage);
  useEffect(() => { pageRef.current = hookPage; moon.current?.setPage(hookPage); }, [hookPage]);

  useEffect(() => {
    if (!live || !canvas.current) return;
    let alive = true;
    let handle: MoonHandle | null = null;
    const cores = navigator.hardwareConcurrency ?? 4;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    import('./moon').then(({ createMoon }) => {
      if (!alive || !canvas.current) return;
      handle = createMoon({
        canvas: canvas.current, rtl, page: pageRef.current, low: small || cores <= 4, hi: !small && cores >= 8,
        onReady: () => alive && setGlReady(true), onFail: () => alive && setFailed(true),
      });
      moon.current = handle;
    }, () => alive && setFailed(true));
    return () => { alive = false; handle?.dispose(); moon.current = null; setGlReady(false); };
  }, [live, rtl]);

  const pose = poseFor(hookPage, w, h, rtl);
  return (
    <div className={`moon-layer${covered ? ' covered' : ''}`} role="img" aria-label={t('hook.moon')}>
      <div className={`moon-poster${glReady ? ' gone' : ''}${motion ? ' spin' : ''}`} style={{ ...posterStyle(pose, motion && !glReady), backgroundImage: `url(${BASE}data/moon/color_2k.webp)` }} />
      {live ? <canvas ref={canvas} className={glReady ? 'moon-gl on' : 'moon-gl'} /> : null}
    </div>
  );
}

export function HookPage({ n, active }: { n: 0 | 1; active: boolean }) {
  const t = useT();
  const set = usePlanner((s) => s.set);
  const go = (p: Page) => set({ page: p });
  return (
    <section className={`page hook hook-${n}`} inert={!active} aria-hidden={!active}>
      <div className="hook-copy">
        {n === 0 ? (
          <>
            <h1 className="display">{t('hook.1')}</h1>
            <button type="button" className="btn-primary" onClick={() => go(2)}>{t('hook.start')}</button>
          </>
        ) : <h2 className="display">{t('hook.2')}</h2>}
      </div>
    </section>
  );
}
