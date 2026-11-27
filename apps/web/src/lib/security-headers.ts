/**
 * Response hardening for every page the web server renders. Helmet covers the
 * API; HTML used to go out with no security headers at all.
 */

/** A fresh nonce: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Content-Security-Policy for an HTML page. Scripts run only from this origin
 * or carry the request's nonce (the router stamps it on its own inline
 * scripts) or Cloudflare's Turnstile, the bot check on the public forms; the
 * page cannot be framed; the frames it may hold are the Google Maps embed and
 * Turnstile's widget.
 */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

export function contentSecurityPolicy(nonce: string, pageUrl: string, apiOrigin: string): string {
  const { host } = new URL(pageUrl);
  // The API is same-origin in production; in a cross-origin setup it is named
  const api = apiOrigin ? [apiOrigin, apiOrigin.replace(/^http/, 'ws')] : [];
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' ${TURNSTILE_ORIGIN}`,
    // Inline style attributes (computed sizes, HeroUI) — no script can ride on them
    `style-src 'self' 'unsafe-inline'`,
    // Staff can point a news picture at any https image
    `img-src 'self' data: https: ${api.join(' ')}`.trim(),
    `font-src 'self'`,
    // Live availability: same host over ws/wss ('self' alone misses ws: in older browsers)
    `connect-src 'self' ws://${host} wss://${host} ${api.join(' ')}`.trim(),
    `frame-src https://www.google.com ${TURNSTILE_ORIGIN}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`
  ].join('; ');
}

/** Headers every response gets, page or not. */
export function baseSecurityHeaders(https: boolean): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    // A page that opened this one, or that this one opened, on another origin
    // keeps no window handle to it; other sites cannot pull these responses
    // into their own process as subresources. The site opens no pop-ups that
    // report back, and its pictures are not hot-linked from elsewhere.
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-site',
    // Only meaningful (and only honoured) over https
    ...(https ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {})
  };
}

/** Same response, with the hardening headers added (responses can be immutable). */
export function withSecurityHeaders(
  response: Response,
  request: Request,
  csp: string | null
): Response {
  const headers = new Headers(response.headers);
  const https =
    new URL(request.url).protocol === 'https:' ||
    request.headers.get('x-forwarded-proto') === 'https';
  for (const [name, value] of Object.entries(baseSecurityHeaders(https))) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if ((headers.get('content-type') ?? '').startsWith('text/html')) {
    if (csp !== null) headers.set('content-security-policy', csp);
    // Said outright rather than left to each cache's guess: a page carries a
    // per-request nonce and "/" answers by the language cookie, so no shared
    // cache may keep one, and a browser asks again before showing its copy.
    if (!headers.has('cache-control')) headers.set('cache-control', 'private, no-cache');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
