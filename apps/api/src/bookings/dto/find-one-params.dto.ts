import { PickType } from '@nestjs/swagger';
import { BookingDto } from './booking.dto';

export class FindOneParams extends PickType(BookingDto, ['id'] as const) {}
