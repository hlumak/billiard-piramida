import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../drizzle/drizzle.service';
import { users } from '../drizzle/schema';
import { CreateUserDto, UserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(): Promise<UserDto[]> {
    return this.drizzle.db.query.users.findMany();
  }

  async findOne(phone: string): Promise<UserDto> {
    const user = await this.drizzle.db.query.users.findFirst({
      where: eq(users.phone, phone)
    });
    if (!user) {
      throw new NotFoundException();
    }
    return user;
  }

  async create(user: CreateUserDto): Promise<void> {
    let { password } = user;
    if (password) {
      const saltOrRounds = 10;
      password = await bcrypt.hash(password, saltOrRounds);
    }

    await this.drizzle.db
      .insert(users)
      .values({
        ...user,
        password
      })
      .onConflictDoUpdate({ target: users.phone, set: { ...user, password } });
  }
}
