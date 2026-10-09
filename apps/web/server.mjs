// Production server: `vite build` emits only a fetch handler (dist/server/server.js),
// so wrap it with srvx and serve the client assets statically.
import { fileURLToPath } from 'node:url';
import { serve } from 'srvx';
import { staticMiddleware } from 'srvx/static';
import handler from './dist/server/server.js';

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  // Loopback by default; the container image sets HOST=0.0.0.0 so nginx can reach it
  hostname: process.env.HOST ?? '127.0.0.1',
  fetch: handler.fetch,
  // Next to this file, not relative to the working directory: started from
  // anywhere else, SSR used to work while every asset 404'd
  middleware: [staticMiddleware({ dir: fileURLToPath(new URL('./dist/client', import.meta.url)) })]
});

await server.ready();
console.log(`piramida web listening on ${server.url}`);
