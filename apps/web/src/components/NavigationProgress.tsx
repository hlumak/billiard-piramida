import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { m } from '../paraglide/messages.js';

/** Most page changes finish within this; the bar would only flash. */
const SHOW_AFTER_MS = 150;

/**
 * A thin bar along the top while the next page loads its data. The current
 * page stays on screen meanwhile (no blank spinner page), but a slow or
 * retrying load no longer looks like a link that did nothing.
 */
export function NavigationProgress() {
  const loading = useRouterState({ select: state => state.status === 'pending' });
  const [delayPassed, setDelayPassed] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setDelayPassed(true), SHOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setDelayPassed(false);
    };
  }, [loading]);

  if (!loading || !delayPassed) return null;
  return (
    <div
      role="progressbar"
      aria-label={m.loading()}
      className="nav-progress fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-golden/25"
    >
      <div className="nav-progress-bar h-full w-1/3 bg-golden" />
    </div>
  );
}
