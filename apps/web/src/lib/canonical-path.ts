import { baseLocale, locales } from '../paraglide/runtime.js';

const PREFIXED = locales.filter(locale => locale !== baseLocale);

/**
 * Where a page URL that is not in its canonical form belongs: no trailing
 * slash, except a language's home, which is "/uk/" (as the canonical tags and
 * the sitemap say it). Null when the URL is already canonical.
 *
 * The router makes the same corrections, but with a 307 — "temporary", so a
 * search engine keeps the old address on its books. Answered here first with a
 * permanent 308, which also keeps the method and body.
 */
export function canonicalPath(url: URL): string | null {
  const { pathname, search } = url;
  if (PREFIXED.some(locale => pathname === `/${locale}`)) return `${pathname}/${search}`;
  if (pathname === '/' || !pathname.endsWith('/')) return null;
  if (PREFIXED.some(locale => pathname === `/${locale}/`)) return null;
  // One leading slash, never two: "//host" in a Location header is another site
  const trimmed = pathname.replace(/\/+$/, '').replace(/^\/+/, '');
  return `/${trimmed}${search}`;
}
