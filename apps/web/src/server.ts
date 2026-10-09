import { AsyncLocalStorage } from 'node:async_hooks';
import handler from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from './paraglide/server.js';
import { PUBLIC_API_URL } from './lib/api';
import { REQUEST_CONTEXT_KEY, type RequestContext } from './lib/request-context';
import { contentSecurityPolicy, createNonce, withSecurityHeaders } from './lib/security-headers';

// Per-request data for code shared with the browser (see lib/request-context.ts)
const requestContext = new AsyncLocalStorage<RequestContext>();
(globalThis as { [REQUEST_CONTEXT_KEY]?: AsyncLocalStorage<RequestContext> })[REQUEST_CONTEXT_KEY] =
  requestContext;

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

    return requestContext.run({ nonce, forwardedFor }, async () => {
      const response = await paraglideMiddleware(request, ({ request: localizedRequest }) =>
        handler.fetch(localizedRequest)
      );
      const apiOrigin = PUBLIC_API_URL ? new URL(PUBLIC_API_URL).origin : '';
      return withSecurityHeaders(
        response,
        request,
        nonce === undefined ? null : contentSecurityPolicy(nonce, request.url, apiOrigin)
      );
    });
  }
};
