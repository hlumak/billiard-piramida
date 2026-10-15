import { useRef } from 'react';

/**
 * One submit at a time. A form's button only turns busy on the next render,
 * and a quick second tap (or Enter pressed twice) lands before that, sending
 * the request twice; a ref answers at once. `claim` says whether this submit
 * may go ahead; `release` reopens the form after a refusal or an error.
 */
export function useSubmitOnce(): { claim: () => boolean; release: () => void } {
  const busy = useRef(false);
  return {
    claim: () => {
      if (busy.current) return false;
      busy.current = true;
      return true;
    },
    release: () => {
      busy.current = false;
    }
  };
}
