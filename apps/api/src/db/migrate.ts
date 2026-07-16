import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const { db, pool } = createDb(databaseUrl);
// fileURLToPath (not URL.pathname) so a deploy path with spaces or non-ASCII
// characters — which arrive percent-encoded in .pathname — still resolves.
await migrate(db, {
  migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url))
});
console.log('Migrations applied');
await pool.end();
