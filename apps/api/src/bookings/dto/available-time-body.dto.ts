import { PickType } from '@nestjs/swagger';
import { BookingDto } from './booking.dto';

export class AvailableTimeBody extends PickType(BookingDto, ['tableId']) {}
