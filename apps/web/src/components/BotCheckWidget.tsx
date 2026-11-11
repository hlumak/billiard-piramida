import { useEffect, useRef } from 'react';
import type { BotCheck } from '../lib/bot-check';

/**
 * Where a form's Turnstile widget appears when Cloudflare needs the guest to
 * act. Empty (and so taking no room) the rest of the time.
 *
 * `lazy` waits for the guest to start on the surrounding form before loading
 * Turnstile (about 2 MB): for forms that sit on a page people mostly read,
 * like a tournament's sign-up. Without it the check starts right away, for
 * forms the guest came to fill in.
 */
export function BotCheckWidget({
  check,
  lazy = false,
  className
}: {
  check: BotCheck;
  lazy?: boolean;
  className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => (element.current ? check.mount(element.current) : undefined), [check]);
  useEffect(() => {
    const form = lazy ? element.current?.closest('form') : null;
    if (!form) {
      check.start();
      return;
    }
    // Typing, a tap or autofill: whichever comes first
    const start = () => check.start();
    const events = ['focusin', 'pointerdown', 'input'] as const;
    for (const type of events) form.addEventListener(type, start, { once: true, passive: true });
    return () => {
      for (const type of events) form.removeEventListener(type, start);
    };
  }, [check, lazy]);
  return <div ref={element} className={`empty:hidden ${className ?? ''}`} />;
}
