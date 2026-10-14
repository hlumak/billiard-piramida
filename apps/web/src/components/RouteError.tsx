import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { PageLayout } from './site/PageLayout';
import { QueryError } from './QueryError';
import { m } from '../paraglide/messages.js';

/**
 * Router-level error page for a loader that failed (API down, rate limited…).
 * Localized and styled like every other page, with a retry that re-runs the
 * loaders — instead of TanStack's unstyled English default.
 */
export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <PageLayout script="oops" title={m.page_error()} width="narrow">
      <QueryError
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
    </PageLayout>
  );
}
