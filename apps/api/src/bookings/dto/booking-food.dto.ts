import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class BookingFoodDto {
  @ApiProperty({ description: 'Booking ID' })
  @IsNumber()
  bookingId: number;

  @ApiProperty({ description: 'Food item ID' })
  @IsNumber()
  foodId: number;

  @ApiProperty({ description: 'Food item quantity' })
  @IsNumber()
  quantity: number;
}
