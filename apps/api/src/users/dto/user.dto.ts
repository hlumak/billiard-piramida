import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UserDto {
  @ApiProperty({ description: 'User ID', example: 1 })
  @IsString()
  id: string;

  @ApiProperty({ description: 'User phone number', example: '+1234567890' })
  @IsString()
  @Length(10, 15)
  phone: string;

  @ApiProperty({ description: 'User password', example: 'hashedPassword123' })
  @IsOptional()
  @IsString()
  password: string | null;

  @ApiProperty({ description: 'User name', example: 'John', nullable: true })
  @IsOptional()
  @IsString()
  @Length(2, 75)
  name: string | null;
}
