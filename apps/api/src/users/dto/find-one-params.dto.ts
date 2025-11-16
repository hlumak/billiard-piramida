import { PickType } from '@nestjs/swagger';
import { UserDto } from './user.dto';

export class FindOneParams extends PickType(UserDto, ['phone'] as const) {}
