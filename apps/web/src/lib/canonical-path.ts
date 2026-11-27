import { baseLocale, locales } from '../paraglide/runtime.js';

const PREFIXED = locales.filter(locale => locale !== baseLocale);
const BASE_PREFIX = `/${baseLocale}`;

/**
 * Where a page URL that is not in its canonical form belongs: no trailing
 * slash, except a language's home, which is "/uk/" (as the canonical tags and
 * the sitemap say it), and no prefix for Polish, whose pages have none
 * ("/pl/prices" is "/prices"). Null when the URL is already canonical.
 *
 * The router makes the same corrections, but with a 307 — "temporary", so a
 * search engine keeps the old address on its books — and one at a time:
 * "/pl/" took a 308 to "/pl" and then a 307 to "/". Answered here first with
 * one permanent 308, which also keeps the method and body.
 */
export function canonicalPath(url: URL): string | null {
  const { pathname, search } = url;
  const canonical = withoutTrailingSlash(withoutBasePrefix(pathname));
  return canonical === pathname ? null : `${canonical}${search}`;
}

function withoutBasePrefix(pathname: string): string {
  if (pathname !== BASE_PREFIX && !pathname.startsWith(`${BASE_PREFIX}/`)) return pathname;
  // One leading slash, never two: "//host" in a Location header is another site
  return `/${pathname.slice(BASE_PREFIX.length).replace(/^\/+/, '')}`;
}

function withoutTrailingSlash(pathname: string): string {
  if (PREFIXED.some(locale => pathname === `/${locale}`)) return `${pathname}/`;
  if (pathname === '/' || !pathname.endsWith('/')) return pathname;
  if (PREFIXED.some(locale => pathname === `/${locale}/`)) return pathname;
  // The same rule as above: "//host/" must not come out as "//host"
  return `/${pathname.replace(/\/+$/, '').replace(/^\/+/, '')}`;
}
