import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleProvider } from './drizzle.provider';
import * as schema from './schema';

@Injectable()
export class DrizzleService {
  constructor(@Inject(DrizzleProvider) readonly db: NodePgDatabase<typeof schema>) {}
}
