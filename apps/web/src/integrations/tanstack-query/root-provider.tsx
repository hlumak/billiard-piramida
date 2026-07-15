import { QueryClient } from '@tanstack/react-query';

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid immediate post-hydration refetch of loader-prefetched data
        staleTime: 30_000
      }
    }
  });

  return {
    queryClient
  };
}
