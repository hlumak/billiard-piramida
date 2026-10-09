import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/api';

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid immediate post-hydration refetch of loader-prefetched data
        staleTime: 30_000,
        // Never retry during SSR: a failing API would hold every page render
        // through 1+2+4 s of backoff before the fallback kicks in. In the
        // browser, don't retry client errors (e.g. a dead booking URL's 404) —
        // retrying 4xx just delays the error state; 5xx/network still retry.
        retry: (failureCount, error) =>
          typeof window !== 'undefined' &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 3
      }
    }
  });

  return {
    queryClient
  };
}
