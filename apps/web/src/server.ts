import { AsyncLocalStorage } from 'node:async_hooks';
import handler from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from './paraglide/server.js';
import { baseLocale, cookieName, isLocale } from './paraglide/runtime.js';
import { PUBLIC_API_URL } from './lib/api';
import { REQUEST_CONTEXT_KEY, type RequestContext } from './lib/request-context';
import { contentSecurityPolicy, createNonce, withSecurityHeaders } from './lib/security-headers';

// Per-request data for code shared with the browser (see lib/request-context.ts)
const requestContext = new AsyncLocalStorage<RequestContext>();
(globalThis as { [REQUEST_CONTEXT_KEY]?: AsyncLocalStorage<RequestContext> })[REQUEST_CONTEXT_KEY] =
  requestContext;

/**
 * The bare domain in the language this browser picked before. The address
 * decides the language everywhere else (a shared /uk/... link stays
 * Ukrainian); only "/" — what people type — honours an explicit earlier
 * choice. Crawlers carry no cookie, so they still get the Polish home page.
 */
function chosenLocaleRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== '/') return null;
  const cookie = request.headers.get('cookie') ?? '';
  const chosen = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`).exec(cookie)?.[1];
  if (chosen === undefined || chosen === baseLocale || !isLocale(chosen)) return null;
  return new Response(null, {
    status: 302,
    headers: {
      location: `/${chosen}/${url.search}`,
      vary: 'Cookie',
      'cache-control': 'private, no-store'
    }
  });
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

    const chosen = page ? chosenLocaleRedirect(request) : null;
    if (chosen !== null) return chosen;

    return requestContext.run({ nonce, forwardedFor }, async () => {
      // The router de-localizes the URL itself (rewrite in router.tsx), so it
      // gets the original request; handing it the middleware's de-localized
      // copy as well would strip the prefix twice and loop on redirects.
      const response = await paraglideMiddleware(request, () => handler.fetch(request));
      const apiOrigin = PUBLIC_API_URL ? new URL(PUBLIC_API_URL).origin : '';
      return withSecurityHeaders(
        response,
        request,
        nonce === undefined ? null : contentSecurityPolicy(nonce, request.url, apiOrigin)
      );
    });
  }
};
