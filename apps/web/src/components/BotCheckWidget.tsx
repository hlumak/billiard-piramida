import { useEffect, useRef } from 'react';
import type { BotCheck } from '../lib/bot-check';

/**
 * Where a form's Turnstile widget appears when Cloudflare needs the guest to
 * act. Empty (and so taking no room) the rest of the time.
 */
export function BotCheckWidget({ check, className }: { check: BotCheck; className?: string }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => (element.current ? check.mount(element.current) : undefined), [check]);
  return <div ref={element} className={`empty:hidden ${className ?? ''}`} />;
}
