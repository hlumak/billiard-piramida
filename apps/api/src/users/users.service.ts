import { Injectable } from '@nestjs/common';
import { DrizzleService } from '../drizzle/drizzle.service';
import { UserDto } from './user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly drizzle: DrizzleService) {}

  findAll(): Promise<UserDto[]> {
    return this.drizzle.db.query.users.findMany();
  }
}
