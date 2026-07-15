import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  // Drizzle 1.0 RC: no `schema` option here — RQB v2 wires relations separately;
  // this app uses the core query builder only.
  const db = drizzle({ client: pool });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
