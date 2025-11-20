import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { BookingFoodDto } from './booking-food.dto';
import { BookingDto } from './booking.dto';

export class CreateBookingDto extends OmitType(BookingDto, [
  'id',
  'totalPrice',
  'createdAt',
  'updatedAt'
] as const) {
  @ApiProperty({
    description: 'Food items for booking',
    example: [
      { foodId: 1, quantity: 2 },
      { foodId: 3, quantity: 1 }
    ]
  })
  @IsOptional()
  bookingFood?: CreateBookingFoodDto[];
}

export class CreateBookingFoodDto extends OmitType(BookingFoodDto, ['bookingId'] as const) {}
