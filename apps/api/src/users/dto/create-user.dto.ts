import { OmitType } from '@nestjs/swagger';
import { Length } from 'class-validator';
import { UserDto } from './user.dto';

export class CreateUserDto extends OmitType(UserDto, ['id'] as const) {
  @Length(8, 32)
  password: string | null;
}
