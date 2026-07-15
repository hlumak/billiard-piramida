import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const { db, pool } = createDb(databaseUrl);
await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
console.log('Migrations applied');
await pool.end();
