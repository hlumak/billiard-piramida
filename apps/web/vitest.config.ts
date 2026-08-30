import { defineConfig } from 'vitest/config';
import viteReact from '@vitejs/plugin-react';

/**
 * Component tests run on a bare React + jsdom setup rather than the app's
 * vite.config.ts: the TanStack Start plugin builds a server/client pair that
 * has nothing to do with rendering a single component in memory.
 */
export default defineConfig({
  plugins: [viteReact()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.tsx']
  }
});
