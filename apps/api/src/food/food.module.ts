import { Module } from '@nestjs/common';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { FoodController } from './food.controller';
import { FoodService } from './food.service';

@Module({
  imports: [DrizzleModule],
  controllers: [FoodController],
  providers: [FoodService],
  exports: [FoodService]
})
export class FoodModule {}
