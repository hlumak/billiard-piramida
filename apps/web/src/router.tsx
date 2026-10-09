import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import { routeTree } from './routeTree.gen';
import { CSP_NONCE_HEADER } from './lib/security-headers';

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { getContext } from './integrations/tanstack-query/root-provider';
import { NotFound } from './components/NotFound';
import { RouteError } from './components/RouteError';

/** The nonce the server entry put on this request, so inline scripts pass the CSP. */
const cspNonce = createIsomorphicFn()
  .server((): string | undefined => {
    try {
      return getRequestHeader(CSP_NONCE_HEADER);
    } catch {
      return undefined; // outside a request
    }
  })
  .client((): string | undefined => undefined);

export function getRouter() {
  const context = getContext();
  const nonce = cspNonce();

  const router = createTanStackRouter({
    routeTree,
    context,
    ...(nonce !== undefined ? { ssr: { nonce } } : {}),
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Unknown URLs get the localized 404 instead of the unstyled English default
    defaultNotFoundComponent: NotFound,
    // …and a failed loader the localized error page with a retry
    defaultErrorComponent: RouteError
  });

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
