import { getLocale, locales, setLocale } from '../paraglide/runtime.js';
import { m } from '../paraglide/messages.js';

const LABELS = { uk: 'УКР', pl: 'PL', en: 'EN' } as const;
/** Each language named in itself, and spoken in its own voice via `lang`. */
const NAMES = { uk: 'Українська', pl: 'Polski', en: 'English' } as const;

export function LocaleSwitcher() {
  const current = getLocale();
  return (
    <div role="group" className="flex items-center justify-center gap-2" aria-label={m.language()}>
      {locales.map(locale => (
        <button
          key={locale}
          type="button"
          lang={locale}
          // Starts with the visible text, so voice control ("click PL") still works
          aria-label={`${LABELS[locale]}, ${NAMES[locale]}`}
          onClick={() => setLocale(locale)}
          aria-pressed={locale === current}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
            locale === current ? 'bg-golden text-btn-text' : 'text-creme hover:bg-club-green-light'
          }`}
        >
          {LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
