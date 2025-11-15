import { Injectable } from '@nestjs/common';
import { DrizzleService } from '../drizzle/drizzle.service';
import { UserDto, CreateUserDto } from './dto';
import { users } from 'src/drizzle/schema';

@Injectable()
export class UsersService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(): Promise<UserDto[]> {
    return this.drizzle.db.query.users.findMany();
  }

  async create(user: CreateUserDto): Promise<void> {
    await this.drizzle.db.insert(users).values(user);
  }
}
