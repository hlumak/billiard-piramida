import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsString } from 'class-validator';

export class BookingDto {
  @ApiProperty({ description: 'Booking ID', example: 1 })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'User ID', example: '01231231-1234-5678-ab90-12a34b567c89' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Table ID', example: 1 })
  @IsNumber()
  tableId: number;

  @ApiProperty({ description: 'Booking time' })
  @IsDate()
  @Type(() => Date)
  time: Date;

  @ApiProperty({ description: 'Booking duration' })
  @IsNumber()
  originalDuration: number;

  @ApiProperty({ description: 'Booking duration with extensions' })
  @IsNumber()
  currentDuration: number;

  @ApiProperty({ description: 'Booking total price', example: 349.99 })
  @IsNumber()
  totalPrice: number;

  @ApiProperty({ description: 'Booking creation date' })
  @IsDate()
  createdAt: Date;

  @ApiProperty({ description: 'Booking update date' })
  @IsDate()
  updatedAt: Date;
}
