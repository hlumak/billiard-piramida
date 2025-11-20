import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { BookingDto } from './dto/booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { FindOneParams } from './dto/find-one-params.dto';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @ApiOperation({ description: 'Get all the bookings' })
  @Get()
  async findAll(): Promise<BookingDto[]> {
    return this.bookingsService.findAll();
  }

  @ApiOperation({ description: 'Get one booking by its id' })
  @Get(':id')
  async findOne(@Param() params: FindOneParams): Promise<BookingDto> {
    return this.bookingsService.findOne(params.id);
  }

  @ApiOperation({ description: 'Create booking' })
  @Post()
  async create(@Body() booking: CreateBookingDto): Promise<void> {
    await this.bookingsService.create(booking);
  }
}
