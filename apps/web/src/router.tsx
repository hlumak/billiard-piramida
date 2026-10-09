import { createRouter as createTanStackRouter, lazyRouteComponent } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { currentRequestContext } from './lib/request-context';
import { deLocalizeUrl, localizeUrl } from './paraglide/runtime.js';

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { getContext } from './integrations/tanstack-query/root-provider';
import { NotFound } from './components/NotFound';

export function getRouter() {
  const context = getContext();
  // The nonce the server entry made for this response, so inline scripts pass the CSP
  const nonce = currentRequestContext()?.nonce;

  const router = createTanStackRouter({
    routeTree,
    context,
    // Routes are defined once, without a language: "/uk/prices" is matched as
    // "/prices", and every link and redirect gets the current prefix back
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url)
    },
    ...(nonce !== undefined ? { ssr: { nonce } } : {}),
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Unknown URLs get the localized 404 instead of the unstyled English default
    defaultNotFoundComponent: NotFound,
    // …and a failed loader the localized error page with a retry — loaded on
    // demand: statically it put HeroUI's Button into every page's entry chunk
    defaultErrorComponent: lazyRouteComponent(() => import('./components/RouteError'), 'RouteError')
  });

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
