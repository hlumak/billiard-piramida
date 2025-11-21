import { Module } from '@nestjs/common';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { FoodModule } from 'src/food/food.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsGateway } from './bookings.gateway';

@Module({
  imports: [DrizzleModule, FoodModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsGateway]
})
export class BookingsModule {}
