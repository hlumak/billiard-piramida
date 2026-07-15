import { Type } from '@sinclair/typebox';
import type { TableDto } from '@repo/shared';
import { tables } from '../db/schema.ts';
import { TABLE_RESPONSE } from '../lib/schemas.ts';
import type { AppInstance } from '../app.ts';

export function tableRoutes(app: AppInstance) {
  app.get(
    '/api/tables',
    { schema: { response: { 200: Type.Array(TABLE_RESPONSE) } } },
    async (): Promise<TableDto[]> => {
      return app.db.select().from(tables).orderBy(tables.id);
    }
  );
}
