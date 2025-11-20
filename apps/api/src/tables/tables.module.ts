import { Module } from '@nestjs/common';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [DrizzleModule],
  controllers: [TablesController],
  providers: [TablesService]
})
export class TablesModule {}
