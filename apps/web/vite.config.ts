import { defineConfig, loadEnv } from 'vite';
import { devtools } from '@tanstack/devtools-vite';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';

import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import optimizeLocales from '@react-aria/optimize-locales-plugin';

/** The monorepo keeps one .env at its root (the API reads it too). */
const ENV_DIR = '../..';

/**
 * A production bundle bakes VITE_SITE_URL into canonical/og:url/JSON-LD.
 * Unset (or localhost) it falls back to http://localhost:8080 — wrong for a
 * real deploy, so a release build (RELEASE_BUILD=1, set by the Dockerfile)
 * refuses; a local `pnpm build` only warns.
 */
function checkSiteUrl(mode: string) {
  if (mode !== 'production') return;
  const siteUrl = loadEnv(mode, ENV_DIR, 'VITE_').VITE_SITE_URL ?? process.env.VITE_SITE_URL;
  if (siteUrl && !/localhost|127\.0\.0\.1/.test(siteUrl)) return;
  const message = `VITE_SITE_URL is ${siteUrl ? `"${siteUrl}"` : 'unset'}: canonical and share URLs will point at localhost`;
  if (process.env.RELEASE_BUILD === '1') throw new Error(message);
  console.warn(`⚠ ${message}`);
}

const config = defineConfig(({ mode }) => {
  checkSiteUrl(mode);
  return {
    envDir: ENV_DIR,
    // Production SSR bundles its dependencies: the runtime image then needs
    // only srvx, not ~340 MB of node_modules (much of it build tooling)
    ...(mode === 'production' ? { ssr: { noExternal: true } } : {}),
    resolve: { tsconfigPaths: true },
    plugins: [
      devtools(),
      tailwindcss(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
        // The language is part of the address: Polish (the base) at /, the
        // others under /uk and /en. Each language is then its own crawlable
        // page with hreflang alternates; before, all three shared one URL and
        // search engines only ever saw the Polish one. The cookie and the
        // browser's preference still decide where the URL can't (API calls).
        // Keep in step with the "generate" script in package.json.
        strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale']
      }),
      // React Aria ships UI strings (and calendars) for 34 locales; keep the app's
      // three (packages/shared SUPPORTED_LOCALES) out of the client bundle's ~53 kB
      optimizeLocales.vite({ locales: ['uk', 'pl', 'en'] }),
      tanstackStart(),
      viteReact()
    ]
  };
});

export default config;
