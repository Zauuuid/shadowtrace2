/** Bottom sheet on phones, small side drawer on desktop. Esc closes; focus moves in and stays inside. */
import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';

export function Sheet({ title, onClose, children, label }: { title?: ReactNode; label: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && box.current) {
        const f = box.current.querySelectorAll<HTMLElement>('button, a, input, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={box} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          {title ? <h2 className="sheet-title">{title}</h2> : <span />}
          <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}><Icon name="cross" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
