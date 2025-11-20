import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class TableDto {
  @ApiProperty()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsNumber()
  tableNumber: number;

  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
