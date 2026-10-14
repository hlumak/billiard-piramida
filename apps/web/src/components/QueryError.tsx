import { Button } from '@heroui/react';
import { isRateLimited } from '../lib/api';
import { m } from '../paraglide/messages.js';

/**
 * Inline error state with retry — queries must never dead-end in a spinner.
 * Given the error, a refusal for too many requests says so ("wait a minute")
 * instead of the generic "something went wrong", which reads like a broken site.
 */
export function QueryError({ onRetry, error }: { onRetry: () => void; error?: unknown }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10" role="alert">
      <p className="text-center text-grey-cool">
        {isRateLimited(error) ? m.err_rate_limited() : m.err_generic()}
      </p>
      <Button variant="outline" className="border-golden text-creme" onPress={onRetry}>
        {m.btn_retry()}
      </Button>
    </div>
  );
}
