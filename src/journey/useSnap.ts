/**
 * Two-click opening (MASTER-PROMPT §4.2): one wheel tick, swipe, PageDown, Space or ↓ moves one page at once; up goes
 * back. While a page change runs, input is ignored, and trackpad momentum (a stream of small, closely spaced wheel
 * events) never counts as a new gesture. On the planner the page scrolls normally; a fresh upward gesture at its very
 * top returns to the second hook.
 */
import { useEffect, type RefObject } from 'react';
import { usePlanner, type Page } from '../state/store';
import { PAGE_MS } from './pose';

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const inModal = (el: EventTarget | null) => el instanceof Element && !!el.closest('[aria-modal="true"], .map, .tl-svg, .tl-over');

export function useSnap(planner: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    let busyUntil = 0;
    let lastWheel = 0, lastAbs = 0;
    let touch: { y: number; top: number; ignore: boolean } | null = null;
    const page = () => usePlanner.getState().page;
    const atTop = () => (planner.current?.scrollTop ?? 0) <= 0;
    const go = (p: number) => {
      const now = performance.now();
      if (now < busyUntil) return;
      const next = Math.max(0, Math.min(2, p)) as Page;
      if (next === page()) return;
      busyUntil = now + PAGE_MS + 80;
      usePlanner.setState({ page: next });
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const now = performance.now();
      const dy = e.deltaY * (e.deltaMode === 1 ? 32 : 1);
      const abs = Math.abs(dy);
      const fresh = now - lastWheel > 180 || abs > lastAbs * 1.6 + 8;
      lastWheel = now; lastAbs = abs;
      if (page() < 2) {
        e.preventDefault();
        if (fresh && abs >= 2) go(page() + Math.sign(dy));
        return;
      }
      if (e.defaultPrevented || inModal(e.target) || dy >= 0) return;
      if (fresh && atTop() && now >= busyUntil) { e.preventDefault(); go(1); }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typing(e.target) || document.querySelector('[aria-modal="true"]')) return;
      const down = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !(e.target instanceof HTMLButtonElement) && !e.shiftKey);
      const up = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey && !(e.target instanceof HTMLButtonElement));
      if (page() < 2) {
        if (down) { e.preventDefault(); go(page() + 1); } else if (up) { e.preventDefault(); go(page() - 1); }
        return;
      }
      if (up && atTop()) { e.preventDefault(); go(1); }
    };

    const onStart = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      touch = { y, top: planner.current?.scrollTop ?? 0, ignore: e.touches.length > 1 || inModal(e.target) };
    };
    const onMove = (e: TouchEvent) => {
      // The hooks never scroll natively (no rubber band, no pull-to-refresh).
      if (page() < 2 && e.cancelable) e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      const s = touch;
      touch = null;
      if (!s || s.ignore) return;
      const dy = s.y - (e.changedTouches[0]?.clientY ?? s.y);
      if (page() < 2) { if (Math.abs(dy) > 36) go(page() + Math.sign(dy)); return; }
      if (dy < -70 && s.top <= 0 && atTop()) go(1);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [planner]);
}
