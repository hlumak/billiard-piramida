import { X } from 'lucide-react';
import { m } from '../paraglide/messages.js';

/**
 * The cross at the end of a search field that empties it. Only there while
 * the field has something to clear; focus goes back to the field, so typing
 * can go straight on.
 */
export function ClearButton({
  value,
  onClear,
  input
}: {
  value: string;
  onClear: () => void;
  input: React.RefObject<HTMLInputElement | null>;
}) {
  if (value === '') return null;
  return (
    <button
      type="button"
      aria-label={m.search_clear()}
      onClick={() => {
        onClear();
        input.current?.focus();
      }}
      // 32px to hit, inside the 44px field; pulled into its right padding
      className="-mr-1.5 flex size-8 flex-none items-center justify-center rounded-full text-grey-cool transition-colors hover:bg-creme/10 hover:text-creme focus-visible:ring-2 focus-visible:ring-golden focus-visible:outline-none"
    >
      <X aria-hidden className="size-4" strokeWidth={2.4} />
    </button>
  );
}
