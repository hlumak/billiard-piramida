import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DrizzleService } from 'src/drizzle/drizzle.service';
import { bookingFood, bookings } from 'src/drizzle/schema';
import { FoodService } from 'src/food/food.service';
import { BookingDto } from './dto/booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  private readonly bookingPrice: number;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly foodService: FoodService,
    private readonly configService: ConfigService
  ) {
    const price = Number(this.configService.getOrThrow('BOOKING_PRICE'));
    if (isNaN(price) || price <= 0) {
      throw new Error('BOOKING_PRICE must be a valid number and greater than 0');
    }
    this.bookingPrice = price;
  }

  async findAll(): Promise<BookingDto[]> {
    return this.drizzle.db.query.bookings.findMany();
  }

  async findOne(bookingId: number): Promise<BookingDto> {
    const booking = await this.drizzle.db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId)
    });
    if (!booking) {
      throw new NotFoundException('Booking is not found');
    }
    return booking;
  }

  async create(booking: CreateBookingDto): Promise<void> {
    const { bookingFood: bookingFoodItems, ...insertBooking } = booking;

    let totalPrice = this.bookingPrice;

    const hasFoodItems = bookingFoodItems && bookingFoodItems.length > 0;

    if (hasFoodItems) {
      const foodIds = bookingFoodItems.map(item => item.foodId);

      const foodItems = await this.foodService.findByIds(foodIds);

      const foodTotal = bookingFoodItems.reduce((sum, bookingItem) => {
        const foodItem = foodItems.find(f => f.id === bookingItem.foodId);
        return sum + (foodItem ? foodItem.price * bookingItem.quantity : 0);
      }, 0);

      totalPrice += foodTotal;
    }

    const createdBooking = await this.drizzle.db
      .insert(bookings)
      .values({
        ...insertBooking,
        totalPrice
      })
      .returning();

    if (hasFoodItems) {
      await this.drizzle.db.insert(bookingFood).values(
        bookingFoodItems.map(item => ({
          bookingId: createdBooking[0].id,
          foodId: item.foodId,
          quantity: item.quantity
        }))
      );
    }
  }
}
