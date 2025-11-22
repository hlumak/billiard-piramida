import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import dayjs from 'dayjs';
import { and, between, eq } from 'drizzle-orm';
import { DrizzleService } from 'src/drizzle/drizzle.service';
import { bookingFood, bookings } from 'src/drizzle/schema';
import { FoodService } from 'src/food/food.service';
import { AvailableTimeBody } from './dto/available-time-body.dto';
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

  async findAvailableBookingTime(availableTimeBody: AvailableTimeBody): Promise<Date[]> {
    const now = dayjs();
    const startOfToday = now.startOf('day').toDate();
    const endOfToday = now.endOf('day').toDate();

    const bookingStartTime = this.configService.getOrThrow<string>('BOOKING_START_TIME');
    const bookingEndTime = this.configService.getOrThrow<string>('BOOKING_END_TIME');

    const [startHour, startMinute] = bookingStartTime.split(':').map(Number);
    const [endHour, endMinute] = bookingEndTime.split(':').map(Number);

    const bookingStart = now.hour(startHour).minute(startMinute).second(0).millisecond(0);
    const bookingEnd = now.hour(endHour).minute(endMinute).second(0).millisecond(0);

    const todayBookings = await this.drizzle.db.query.bookings.findMany({
      columns: {
        time: true,
        currentDuration: true
      },
      where: and(
        eq(bookings.tableId, availableTimeBody.tableId),
        between(bookings.time, startOfToday, endOfToday)
      )
    });

    const occupiedRanges: Array<{ start: Date; end: Date }> = todayBookings.map(booking => {
      const startTime = dayjs(booking.time);
      const endTime = startTime.add(booking.currentDuration, 'minute');
      return {
        start: startTime.toDate(),
        end: endTime.toDate()
      };
    });

    const availableSlots: Date[] = [];
    let currentSlot = bookingStart;

    while (currentSlot.isBefore(bookingEnd) || currentSlot.isSame(bookingEnd, 'hour')) {
      const slotTime = currentSlot.toDate();
      slotTime.setHours(slotTime.getHours() + 1);
      const slotStart = dayjs(slotTime);
      const slotEnd = slotStart.add(1, 'hour');

      const isAvailable = !occupiedRanges.some(range => {
        const rangeStart = dayjs(range.start);
        const rangeEnd = dayjs(range.end);

        return slotStart.isBefore(rangeEnd) && slotEnd.isAfter(rangeStart);
      });

      if (isAvailable) {
        availableSlots.push(slotTime);
      }

      currentSlot = currentSlot.add(1, 'hour');
    }

    return availableSlots;
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
