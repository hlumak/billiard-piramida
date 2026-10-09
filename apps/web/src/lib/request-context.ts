/**
 * Per-request data the server entry (src/server.ts) hands to code that is
 * shared with the browser — the API client and the router.
 *
 * Shared modules must not import server modules (@tanstack/react-start/server,
 * createIsomorphicFn): doing so pulled Start's client runtime into every page,
 * about 90 kB on the entry chunk. Instead the server entry registers an
 * AsyncLocalStorage under a global symbol and runs each request inside it;
 * shared code reads it only on the server.
 */
export interface RequestContext {
  /** X-Forwarded-For chain to pass on to the API (visitor IP for rate limits) */
  forwardedFor?: string | undefined;
  /** CSP nonce for this response's inline scripts */
  nonce?: string | undefined;
}

export const REQUEST_CONTEXT_KEY = Symbol.for('piramida.request-context');

interface ContextStore {
  getStore(): RequestContext | undefined;
}

/** The current request's context during SSR; undefined in the browser. */
export function currentRequestContext(): RequestContext | undefined {
  if (!import.meta.env.SSR) return undefined;
  const store = (globalThis as { [REQUEST_CONTEXT_KEY]?: ContextStore })[REQUEST_CONTEXT_KEY];
  return store?.getStore();
}
