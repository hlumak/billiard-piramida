import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsNumber, IsString } from 'class-validator';

export class FoodDto {
  @ApiProperty({ description: 'Booking ID', example: 1 })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'Food item name', example: 'Cola 0,5l' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Food item price', example: 24.99 })
  @IsNumber()
  price: number;

  @ApiProperty({ description: 'Food item quantity', example: 100 })
  @IsNumber()
  quantity: number;

  @ApiProperty({ description: 'Booking creation date' })
  @IsDate()
  createdAt: Date;

  @ApiProperty({ description: 'Booking update date' })
  @IsDate()
  updatedAt: Date;
}
