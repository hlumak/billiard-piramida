import handler from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from './paraglide/server.js';
import { PUBLIC_API_URL } from './lib/api';
import {
  CSP_NONCE_HEADER,
  contentSecurityPolicy,
  createNonce,
  withSecurityHeaders
} from './lib/security-headers';

export default {
  fetch: async (request: Request) => {
    // Dev (vite dev) injects its own unnonced inline scripts for HMR, so the CSP
    // is production-only; the other headers apply everywhere.
    // Pages are GETs; other methods (no HTML) pass through untouched.
    const page = request.method === 'GET' || request.method === 'HEAD';
    const nonce = import.meta.env.PROD && page ? createNonce() : null;
    let forwarded = request;
    if (nonce !== null) {
      // Overwrite (never trust) any client-sent copy; the router reads it back.
      // srvx hands us its own request class, which `new Request(request)` can't
      // clone: rebuild it from the URL, keeping the peer address srvx attached.
      const headers = new Headers(request.headers);
      headers.set(CSP_NONCE_HEADER, nonce);
      forwarded = new Request(request.url, {
        method: request.method,
        headers,
        signal: request.signal
      });
      const ip = (request as { ip?: string }).ip;
      if (ip !== undefined) Object.defineProperty(forwarded, 'ip', { value: ip });
    }
    const response = await paraglideMiddleware(forwarded, ({ request: localizedRequest }) =>
      handler.fetch(localizedRequest)
    );
    const apiOrigin = PUBLIC_API_URL ? new URL(PUBLIC_API_URL).origin : '';
    return withSecurityHeaders(
      response,
      request,
      nonce === null ? null : contentSecurityPolicy(nonce, request.url, apiOrigin)
    );
  }
};
