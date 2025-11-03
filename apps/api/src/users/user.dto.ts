import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ description: 'User ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'User phone number', example: '+1234567890' })
  phone: string;

  @ApiProperty({ description: 'User password', example: 'hashedPassword123' })
  password: string;

  @ApiProperty({ description: 'User first name', example: 'John', nullable: true })
  firstName: string | null;

  @ApiProperty({ description: 'User last name', example: 'Doe', nullable: true })
  lastName: string | null;
}
