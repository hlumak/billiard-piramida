import { AsyncLocalStorage } from 'node:async_hooks';
import handler from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from './paraglide/server.js';
import { PUBLIC_API_URL } from './lib/api';
import { canonicalPath } from './lib/canonical-path';
import { llmsLinkHeader } from './lib/llms';
import { chosenHome, expiredLegacyCookie } from './lib/locale-choice';
import { REQUEST_CONTEXT_KEY, type RequestContext } from './lib/request-context';
import { contentSecurityPolicy, createNonce, withSecurityHeaders } from './lib/security-headers';

// Per-request data for code shared with the browser (see lib/request-context.ts)
const requestContext = new AsyncLocalStorage<RequestContext>();
(globalThis as { [REQUEST_CONTEXT_KEY]?: AsyncLocalStorage<RequestContext> })[REQUEST_CONTEXT_KEY] =
  requestContext;

/**
 * The bare domain in the language this browser picked in the switcher. The
 * address decides the language everywhere else (a shared /uk/... link stays
 * Ukrainian); only "/" — what people type — honours an explicit earlier
 * choice. Crawlers carry no cookie, so they still get the Polish home page.
 */
function chosenLocaleRedirect(request: Request): Response | null {
  const location = chosenHome(new URL(request.url), request.headers.get('cookie'));
  if (location === null) return null;
  return new Response(null, {
    status: 302,
    headers: { location, vary: 'Cookie', 'cache-control': 'private, no-store' }
  });
}

/**
 * What every response of this server gets on its way out: the hardening
 * headers, the old language cookie taken back where a browser still sends
 * it, and on pages the pointer to llms.txt.
 */
function harden(response: Response, request: Request, csp: string | null): Response {
  const hardened = withSecurityHeaders(response, request, csp);
  const expired = expiredLegacyCookie(request.headers.get('cookie'));
  if (expired !== null) hardened.headers.append('set-cookie', expired);
  if ((hardened.headers.get('content-type') ?? '').startsWith('text/html')) {
    hardened.headers.append('link', llmsLinkHeader(new URL(request.url).pathname));
  }
  return hardened;
}

export default {
  fetch: (request: Request) => {
    // Dev (vite dev) injects its own unnonced inline scripts for HMR, so the CSP
    // is production-only; the other headers apply everywhere. Pages are GETs.
    const page = request.method === 'GET' || request.method === 'HEAD';
    const nonce = import.meta.env.PROD && page ? createNonce() : undefined;
    // The chain nginx built, plus the hop that reached this server (srvx's peer)
    const forwardedFor =
      [request.headers.get('x-forwarded-for'), (request as { ip?: string }).ip]
        .filter(Boolean)
        .join(', ') || undefined;

    // The two redirects answer before the app does, and are still responses
    // of this site: without the headers, a first visit that landed on one
    // (a trailing slash, "/" with a language chosen earlier) got no HSTS
    const canonical = page ? canonicalPath(new URL(request.url)) : null;
    if (canonical !== null) {
      return harden(
        new Response(null, { status: 308, headers: { location: canonical } }),
        request,
        null
      );
    }

    const chosen = page ? chosenLocaleRedirect(request) : null;
    if (chosen !== null) return harden(chosen, request, null);

    return requestContext.run({ nonce, forwardedFor }, async () => {
      // The router de-localizes the URL itself (rewrite in router.tsx), so it
      // gets the original request; handing it the middleware's de-localized
      // copy as well would strip the prefix twice and loop on redirects.
      const response = await paraglideMiddleware(request, () => handler.fetch(request));
      const apiOrigin = PUBLIC_API_URL ? new URL(PUBLIC_API_URL).origin : '';
      return harden(
        response,
        request,
        nonce === undefined ? null : contentSecurityPolicy(nonce, request.url, apiOrigin)
      );
    });
  }
};
