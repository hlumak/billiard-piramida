import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export interface DbOptions {
  /**
   * Server-side guards for request traffic: a runaway query, or a transaction
   * left open, would otherwise hold one of the 10 connections indefinitely.
   * Off for tooling (migrations may legitimately run long).
   */
  requestTimeouts?: boolean;
}

export function createDb(databaseUrl: string, { requestTimeouts = false }: DbOptions = {}) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    // Fail fast instead of hanging a request forever when the pool is saturated
    // or Postgres is unreachable.
    connectionTimeoutMillis: 5000,
    ...(requestTimeouts
      ? { statement_timeout: 10_000, idle_in_transaction_session_timeout: 15_000 }
      : {})
  });
  // Drizzle 1.0 RC: no `schema` option here — RQB v2 wires relations separately;
  // this app uses the core query builder only.
  const db = drizzle({ client: pool });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
