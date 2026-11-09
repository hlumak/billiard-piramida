import { useRouterState } from '@tanstack/react-router';
import type { MouseEvent } from 'react';
import { getLocale, locales, setLocale, type Locale } from '../paraglide/runtime.js';
import { m } from '../paraglide/messages.js';
import { localizedPath } from '../lib/seo';

const LABELS = { uk: 'УКР', pl: 'PL', en: 'EN' } as const;

/**
 * Switching language loads the page anew, server render included. A burst of
 * clicks used to start a load per click, and each one that got as far as the
 * server spent API requests; only the first click of a burst now switches.
 * Module state, so it spans every switcher on the page (header, menu, footer).
 * The new page starts with a fresh module; the timer only matters if the load
 * is stopped (Esc) and the visitor stays on this page.
 */
let switching = false;

function switchTo(locale: Locale) {
  // The current language is a no-op for setLocale; it must not arm the lock either
  if (switching || locale === getLocale()) return;
  switching = true;
  setTimeout(() => {
    switching = false;
  }, 3000);
  setLocale(locale);
}

/** Each language named in itself, and spoken in its own voice via `lang`. */
const NAMES = { uk: 'Українська', pl: 'Polski', en: 'English' } as const;

/**
 * The three languages as one segmented control. `stretch` fills its container
 * (the menu sheet); otherwise it sizes to its labels (header, footer).
 *
 * Each language is a real link to this page in that language: search engines
 * only follow `<a href>`, and with buttons the other languages were reachable
 * only through hreflang and the sitemap (the Ukrainian home page sat
 * "discovered, not indexed" for weeks). A plain click still goes through
 * setLocale, which also remembers the choice in the locale cookie.
 */
export function LocaleSwitcher({
  stretch = false,
  className
}: {
  stretch?: boolean;
  className?: string;
}) {
  const current = getLocale();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const searchStr = useRouterState({ select: state => state.location.searchStr });

  const onClick = (event: MouseEvent, locale: Locale) => {
    // A modified or middle click still means "open that language in a new tab"
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    switchTo(locale);
  };

  return (
    <div
      role="group"
      aria-label={m.language()}
      className={`${stretch ? 'grid grid-cols-3' : 'inline-flex'} gap-1 rounded-xl bg-club-green-dark p-1 ${className ?? ''}`}
    >
      {locales.map(locale => (
        <a
          key={locale}
          href={`${localizedPath(pathname, locale)}${searchStr}`}
          hrefLang={locale}
          lang={locale}
          // Starts with the visible text, so voice control ("click PL") still works
          aria-label={`${LABELS[locale]}, ${NAMES[locale]}`}
          aria-current={locale === current ? 'true' : undefined}
          onClick={event => onClick(event, locale)}
          className={`flex items-center justify-center rounded-[9px] px-3.5 transition-colors ${
            stretch ? 'h-11 text-sm' : 'h-9 text-[13px]'
          } ${
            locale === current
              ? 'bg-golden font-bold text-btn-text'
              : 'font-semibold text-creme hover:bg-club-green-light'
          }`}
        >
          {LABELS[locale]}
        </a>
      ))}
    </div>
  );
}
