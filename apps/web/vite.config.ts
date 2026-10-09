import { defineConfig, loadEnv } from 'vite';
import { devtools } from '@tanstack/devtools-vite';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';

import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

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
    resolve: { tsconfigPaths: true },
    plugins: [
      devtools(),
      tailwindcss(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
        strategy: ['cookie', 'preferredLanguage', 'baseLocale']
      }),
      tanstackStart(),
      viteReact()
    ]
  };
});

export default config;
