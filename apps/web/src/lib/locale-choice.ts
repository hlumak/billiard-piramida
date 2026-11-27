import { baseLocale, isLocale, type Locale } from '../paraglide/runtime.js';

/**
 * The language a visitor picked in the switcher. Written only by that click:
 * the address decides the language of every page, and this is read in one
 * place, the bare domain, which people type and which has no language of its
 * own. Same naming as the other first-party cookies (piramida.auth).
 */
export const LOCALE_CHOICE_COOKIE = 'piramida.lang';

/**
 * The language runtime's own cookie. It was written on the first page view in
 * any language, so following a shared /uk/… link counted as choosing
 * Ukrainian, and it was stored without anyone asking for it. The runtime no
 * longer uses a cookie (see vite.config.ts); browsers that still carry this
 * one are told to drop it. Safe to delete after 2028-01 (it lived 400 days).
 */
const LEGACY_COOKIE = 'PARAGLIDE_LOCALE';

/** 400 days, the longest a browser keeps a cookie. */
const MAX_AGE_S = 400 * 24 * 60 * 60;

function cookieValue(header: string | null, name: string): string | undefined {
  return header
    ?.split(';')
    .map(entry => entry.trim())
    .find(entry => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** Called by the language switcher, in the browser. */
export function rememberLocaleChoice(locale: Locale): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  try {
    document.cookie = `${LOCALE_CHOICE_COOKIE}=${locale}; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax${secure}`;
  } catch {
    // document.cookie throws in sandboxed frames; the switch itself still works
  }
}

/**
 * Where a request for the bare domain goes instead, when its visitor chose
 * another language earlier; null for every other address and for Polish,
 * which is the bare domain. Crawlers carry no cookie and get the Polish page.
 */
export function chosenHome(url: URL, cookieHeader: string | null): string | null {
  if (url.pathname !== '/') return null;
  const chosen = cookieValue(cookieHeader, LOCALE_CHOICE_COOKIE);
  if (chosen === undefined || chosen === baseLocale || !isLocale(chosen)) return null;
  return `/${chosen}/${url.search}`;
}

/** A Set-Cookie value that removes the old cookie, when the request carries it. */
export function expiredLegacyCookie(cookieHeader: string | null): string | null {
  return cookieValue(cookieHeader, LEGACY_COOKIE) === undefined
    ? null
    : `${LEGACY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
