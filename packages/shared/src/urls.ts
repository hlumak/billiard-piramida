/**
 * Admin-authored URLs (news images and card links) end up in `src`/`href`, so
 * only two shapes are accepted: an app-relative path (`/prices`) or an absolute
 * http(s) URL. `javascript:`/`data:` payloads and protocol-relative `//host`
 * hijacks are rejected — checked on write (422) and again at render, because a
 * row written before this guard existed must not become an XSS vector.
 *
 * Backslashes are normalized to slashes by URL parsers, so `/\evil.tld` is a
 * protocol-relative URL in disguise and is rejected with `//`.
 */
export function isSafeUrl(value: string): boolean {
  if (value.startsWith('/')) return !/^\/[/\\]/.test(value);
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** External links need `rel="noreferrer"` and open in a new tab; internal ones don't. */
export function isExternalUrl(value: string): boolean {
  return !value.startsWith('/');
}
