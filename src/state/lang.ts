/**
 * Interface language. First visit: the route (#/en, #/ar) if present, else the saved choice, else the browser
 * language (Arabic browsers get Arabic), else English. The choice is saved when the user presses the toggle.
 */
export type Lang = 'ar' | 'en';
export const LANG_KEY = 'st-lang-choice';

export function pickLang(route: string | null, stored: string | null, browser: readonly string[]): Lang {
  if (route === 'ar' || route === 'en') return route;
  if (stored === 'ar' || stored === 'en') return stored;
  return browser.some((l) => /^ar\b/i.test(l)) ? 'ar' : 'en';
}

export function routeLang(hash: string): Lang | null {
  const m = /^#\/(en|ar)\b/.exec(hash);
  return m ? (m[1] as Lang) : null;
}

export function firstLang(): Lang {
  if (typeof location === 'undefined') return 'en';
  let stored: string | null = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch { /* storage unavailable */ }
  const browser = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  return pickLang(routeLang(location.hash), stored, browser);
}

export function saveLang(lang: Lang): void {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage unavailable */ }
}
