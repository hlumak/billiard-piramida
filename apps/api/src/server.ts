import { buildApp } from './app.ts';
import { loadConfig } from './lib/config.ts';

const config = loadConfig();

const app = await buildApp({
  databaseUrl: config.databaseUrl,
  logger: { level: config.logLevel },
  allowedOrigins: config.allowedOrigins,
  adminToken: config.adminToken,
  jwtSecret: config.jwtSecret,
  cookieSecure: config.cookieSecure
});

// Graceful shutdown: drain in-flight requests and close the pg pool (onClose hook)
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app
      .close()
      .then(() => process.exit(0))
      .catch(err => {
        app.log.error(err);
        process.exit(1);
      });
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
