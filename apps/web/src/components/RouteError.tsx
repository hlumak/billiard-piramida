import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { PageHeader } from './AppHeader';
import { QueryError } from './QueryError';

/**
 * Router-level error page for a loader that failed (API down, rate limited…).
 * Localized and styled like every other page, with a retry that re-runs the
 * loaders — instead of TanStack's unstyled English default.
 */
export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="oops" />
      <main className="mt-8 flex flex-1 flex-col items-center justify-center py-16">
        <QueryError
          onRetry={() => {
            reset();
            void router.invalidate();
          }}
        />
      </main>
    </div>
  );
}
