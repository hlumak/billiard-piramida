import { UsePipes, ValidationPipe } from '@nestjs/common';
import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { BookingsService } from './bookings.service';
import { AvailableTimeBody } from './dto/available-time-body.dto';

@WebSocketGateway({ path: '/bookings' })
export class BookingsGateway {
  constructor(private readonly bookingsService: BookingsService) {}

  @UsePipes(new ValidationPipe())
  @SubscribeMessage('availableBookingTime')
  async findAvailableBookingTime(@MessageBody() payload: AvailableTimeBody): Promise<Date[]> {
    return this.bookingsService.findAvailableBookingTime(payload);
  }
}
