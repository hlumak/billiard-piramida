// Production server: `vite build` emits only a fetch handler (dist/server/server.js),
// so wrap it with srvx and serve the client assets statically.
import { serve } from 'srvx';
import { serveStatic } from 'srvx/static';
import handler from './dist/server/server.js';

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: process.env.HOST ?? '127.0.0.1',
  fetch: handler.fetch,
  middleware: [serveStatic({ dir: 'dist/client' })]
});

await server.ready();
console.log(`piramida web listening on ${server.url}`);
