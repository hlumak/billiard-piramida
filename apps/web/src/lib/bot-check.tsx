import { useEffect, useRef, useState } from 'react';
import { getLocale } from '../paraglide/runtime.js';

/**
 * Cloudflare Turnstile in front of the forms anyone can send without an
 * account. Most guests never see it: the widget only shows itself when
 * Cloudflare wants an interaction. The token it produces rides to our API in
 * a header, and only the API talks to Cloudflare about it.
 *
 * Without a site key (local dev, or a build that has none) there is no
 * widget and no token, and the API — which decides — lets the form through
 * only if it has no secret either.
 */
const SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The header the API reads the token from (TURNSTILE_HEADER there). */
export const BOT_CHECK_HEADER = 'x-turnstile-token';

/** One per form; the API refuses a token solved for a different one. */
export type BotCheckAction = 'booking' | 'register' | 'tournament';

/** A guest waits this long for the widget at most; then the API has the last word. */
const TOKEN_WAIT_MS = 15_000;

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let script: Promise<TurnstileApi> | null = null;

/** Loaded once, on the first form that needs it, not on every page. */
function loadTurnstile(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.src = SCRIPT_URL;
    element.async = true;
    element.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing'));
    element.onerror = () => {
      // Blocked or offline: let a later form try again
      script = null;
      element.remove();
      reject(new Error('turnstile failed to load'));
    };
    document.head.append(element);
  });
  return script;
}

/** Headers for the request a form sends; none without a token. */
export function botCheckHeaders(token: string | undefined): Record<string, string> | undefined {
  return token === undefined ? undefined : { [BOT_CHECK_HEADER]: token };
}

class BotCheckController {
  private api: TurnstileApi | null = null;
  private widgetId: string | null = null;
  private current: string | null = null;
  /** The widget gave up (error, blocked script): stop waiting for it */
  private failed = false;
  private readonly waiters = new Set<(token: string | undefined) => void>();

  private readonly action: BotCheckAction;

  constructor(action: BotCheckAction) {
    this.action = action;
  }

  /** Draws the widget into `element`; the returned cleanup removes it. */
  mount(element: HTMLElement): () => void {
    if (SITE_KEY === '') return () => undefined;
    let cancelled = false;
    loadTurnstile()
      .then(api => {
        if (cancelled) return;
        this.api = api;
        this.widgetId = api.render(element, {
          sitekey: SITE_KEY,
          action: this.action,
          theme: 'dark',
          language: getLocale(),
          appearance: 'interaction-only',
          size: 'flexible',
          'refresh-expired': 'auto',
          callback: (token: string) => this.settle(token),
          'expired-callback': () => {
            this.current = null;
          },
          'error-callback': () => {
            this.failed = true;
            this.flush(undefined);
          }
        });
      })
      .catch(() => {
        this.failed = true;
        this.flush(undefined);
      });
    return () => {
      cancelled = true;
      if (this.api && this.widgetId !== null) this.api.remove(this.widgetId);
      this.widgetId = null;
      this.current = null;
    };
  }

  /**
   * The token to send, waiting for the widget if it is still working. Resolves
   * undefined when there is no widget or it failed: the API then answers
   * `bot_check_failed`, which the form explains.
   */
  token(): Promise<string | undefined> {
    if (SITE_KEY === '' || this.failed) return Promise.resolve(undefined);
    if (this.current !== null) return Promise.resolve(this.current);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.waiters.delete(done);
        resolve(undefined);
      }, TOKEN_WAIT_MS);
      const done = (token: string | undefined) => {
        clearTimeout(timer);
        resolve(token);
      };
      this.waiters.add(done);
    });
  }

  /** Tokens are single-use: after every attempt, solve for a fresh one. */
  reset(): void {
    this.current = null;
    this.failed = false;
    if (this.api && this.widgetId !== null) this.api.reset(this.widgetId);
  }

  private settle(token: string): void {
    this.current = token;
    this.failed = false;
    this.flush(token);
  }

  private flush(token: string | undefined): void {
    for (const waiter of this.waiters) waiter(token);
    this.waiters.clear();
  }
}

export type BotCheck = Pick<BotCheckController, 'mount' | 'token' | 'reset'>;

/** A form's bot check; render its widget with <BotCheckWidget check={…} />. */
export function useBotCheck(action: BotCheckAction): BotCheck {
  const [check] = useState(() => new BotCheckController(action));
  return check;
}

/**
 * Where the widget appears when Cloudflare needs the guest to act. Empty
 * (and so taking no room) the rest of the time.
 */
export function BotCheckWidget({ check, className }: { check: BotCheck; className?: string }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => (element.current ? check.mount(element.current) : undefined), [check]);
  return <div ref={element} className={`empty:hidden ${className ?? ''}`} />;
}
