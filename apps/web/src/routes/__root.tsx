import { Suspense } from 'react';
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router';

import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { MotionProvider } from '../components/motion';
import { SITE_URL } from '../lib/seo';
import { DevTools } from '../integrations/devtools';

import appCss from '../styles.css?url';

import type { QueryClient } from '@tanstack/react-query';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0b4e31' },
      { title: m.app_title() },
      { property: 'og:site_name', content: 'piramida' },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: `${SITE_URL}/og-image.jpg` },
      { name: 'twitter:card', content: 'summary_large_image' }
    ],
    // Fonts are self-hosted (src/fonts.css via styles.css) — no third-party
    // render-blocking requests on the critical path.
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' }
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
        <MotionProvider>{children}</MotionProvider>
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
