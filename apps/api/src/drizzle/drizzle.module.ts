import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleProvider } from './drizzle.provider';
import { DrizzleService } from './drizzle.service';
import * as schema from './schema';

@Module({
  providers: [
    {
      provide: DrizzleProvider,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.getOrThrow('DATABASE_URL')
        });
        return drizzle(pool, { schema });
      }
    },
    DrizzleService
  ],
  exports: [DrizzleService]
})
export class DrizzleModule {}
