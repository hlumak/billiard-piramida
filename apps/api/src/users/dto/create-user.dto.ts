import { OmitType } from '@nestjs/swagger';
import { UserDto } from './user.dto';
import { Length } from 'class-validator';

export class CreateUserDto extends OmitType(UserDto, ['id'] as const) {
  @Length(8, 32)
  password: string | null;
}
