import { Suspense } from 'react';
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router';

import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { SITE_URL } from '../lib/seo';
import { venueConfigQuery } from '../lib/queries';
import { DevTools } from '../integrations/devtools';

import appCss from '../styles.css?url';

import type { QueryClient } from '@tanstack/react-query';
import type { Locale } from '@repo/shared';

/**
 * Body text (Montserrat 400) in the subsets this locale's copy needs, fetched
 * alongside the stylesheet rather than after it is parsed — the difference
 * between the first paint in the fallback face and in the real one. Weights
 * and faces used less widely still load on demand.
 */
const FONT_PRELOADS: Record<Locale, string[]> = {
  pl: ['montserrat-400-latin', 'montserrat-400-latin-ext'],
  uk: ['montserrat-400-latin', 'montserrat-400-cyrillic'],
  en: ['montserrat-400-latin']
};

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  // Rates and opening hours are read by nearly every screen, so they are
  // fetched once here and served from cache — SSR included. A failure must not
  // take a page down: `useVenueConfig` falls back to the published defaults.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(venueConfigQuery()).catch(() => null),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0b4e31' },
      { title: m.app_title() },
      { property: 'og:site_name', content: 'piramida' },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: `${SITE_URL}/og-image.jpg` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      // X reads og:* as a fallback, but only when a card is already recognised —
      // validators (and the devtools SEO panel) report an empty preview without
      // the explicit twitter:* set, so the card carries its own image/title/desc.
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: `${SITE_URL}/og-image.jpg` },
      { name: 'twitter:image:alt', content: m.app_title() }
    ],
    // Fonts are self-hosted (src/fonts.css via styles.css) — no third-party
    // render-blocking requests on the critical path.
    links: [
      { rel: 'stylesheet', href: appCss },
      ...FONT_PRELOADS[getLocale()].map(font => ({
        rel: 'preload',
        href: `/fonts/${font}.woff2`,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous' as const
      })),
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      { rel: 'manifest', href: `/manifest.webmanifest?locale=${getLocale()}` }
    ]
  }),
  shellComponent: RootDocument
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        {/* First stop for keyboard users: jump past the header to the page */}
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-golden px-4 py-2 font-semibold text-btn-text focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {m.skip_to_content()}
        </a>
        {children}
        {import.meta.env.DEV ? (
          <Suspense fallback={null}>
            <DevTools />
          </Suspense>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
