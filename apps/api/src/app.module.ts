import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BookingsModule } from './bookings/bookings.module';
import { DrizzleModule } from './drizzle/drizzle.module';
import { FoodModule } from './food/food.module';
import { TablesModule } from './tables/tables.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    UsersModule,
    BookingsModule,
    FoodModule,
    TablesModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}
