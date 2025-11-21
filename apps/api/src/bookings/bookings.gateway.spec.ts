import { Test, TestingModule } from '@nestjs/testing';
import { BookingsGateway } from './bookings.gateway';

describe('BookingsGateway', () => {
  let gateway: BookingsGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BookingsGateway]
    }).compile();

    gateway = module.get<BookingsGateway>(BookingsGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
