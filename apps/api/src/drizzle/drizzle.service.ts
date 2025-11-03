import { Inject, Injectable } from '@nestjs/common';
import { DrizzleProvider } from './drizzle.provider';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

@Injectable()
export class DrizzleService {
  constructor(@Inject(DrizzleProvider) readonly db: NodePgDatabase<typeof schema>) {}
}
