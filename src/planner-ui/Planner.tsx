/** The planner (third page, lazy chunk): six steps, one question each, Back / Next in a sticky bottom bar. */
import { useEffect, useState, type RefObject } from 'react';
import { resetPlannerData, usePlannerData } from '../data/data';
import { useAnalysis } from '../hooks/useAnalysis';
import { useT } from '../i18n';
import { LAST_STEP, usePlanner, type Step } from '../state/store';
import { ReportStep, ResultStep } from './result';
import { CraftStep, DatesStep, EllipseStep, SiteStep } from './steps';
import { Loading } from './widgets';

export default function Planner({ scroller }: { scroller: RefObject<HTMLDivElement | null> }) {
  const t = useT();
  const step = usePlanner((s) => s.step);
  const set = usePlanner((s) => s.set);
  const [retry, setRetry] = useState(0);
  const data = usePlannerData(retry);
  const ready = data && !(data instanceof Error) ? data : null;
  const { a, busy } = useAnalysis(ready);

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [step, scroller]);

  const next = () => set(step === LAST_STEP ? { step: 1 } : { step: (step + 1) as Step });
  const back = () => set(step === 1 ? { page: 1 } : { step: (step - 1) as Step });

  return (
    <>
      <main id="main" className={`step s${step}`} key={step}>
        {data instanceof Error ? (
          <div className="error" role="alert">
            <p>{t('state.error')}</p>
            <button type="button" className="btn-primary" onClick={() => { resetPlannerData(); setRetry((r) => r + 1); }}>{t('state.retry')}</button>
          </div>
        ) : !ready ? <Loading label={t('state.loading')} /> : (
          <>
            {step === 1 ? <DatesStep data={ready} /> : null}
            {step === 2 ? <CraftStep /> : null}
            {step === 3 ? <SiteStep data={ready} a={a} busy={busy} /> : null}
            {step === 4 ? <EllipseStep data={ready} a={a} busy={busy} /> : null}
            {step === 5 ? <ResultStep data={ready} a={a} busy={busy} /> : null}
            {step === 6 ? <ReportStep data={ready} a={a} /> : null}
          </>
        )}
      </main>
      <footer className="pnav no-print">
        <div className="pnav-in">
          <button type="button" className="btn-text" onClick={back}>{t('nav.back')}</button>
          <button type="button" className="btn-primary" onClick={next}>{t(step === LAST_STEP ? 'nav.restart' : 'nav.next')}</button>
        </div>
      </footer>
    </>
  );
}
