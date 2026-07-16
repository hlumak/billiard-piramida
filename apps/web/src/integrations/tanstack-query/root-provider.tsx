import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/api';

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid immediate post-hydration refetch of loader-prefetched data
        staleTime: 30_000,
        // Don't retry client errors (e.g. a dead booking URL's 404) — retrying
        // 4xx just delays the error state by ~7s of backoff. 5xx/network still retry.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 3
      }
    }
  });

  return {
    queryClient
  };
}
