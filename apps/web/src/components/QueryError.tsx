import { Button } from '@heroui/react';
import { m } from '../paraglide/messages.js';

/** Inline error state with retry — queries must never dead-end in a spinner. */
export function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10" role="alert">
      <p className="text-center text-grey-cool">{m.err_generic()}</p>
      <Button variant="outline" className="border-golden text-creme" onPress={onRetry}>
        {m.btn_retry()}
      </Button>
    </div>
  );
}
