import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/drizzle/drizzle.service';
import { food } from 'src/drizzle/schema';
import { CreateFoodDto } from './dto/create-food.dto';
import { FoodDto } from './dto/food.dto';

@Injectable()
export class FoodService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(): Promise<FoodDto[]> {
    return this.drizzle.db.query.food.findMany();
  }

  async findByIds(ids: number[]): Promise<FoodDto[]> {
    return this.drizzle.db.query.food.findMany({
      where: (food, { inArray }) => inArray(food.id, ids)
    });
  }

  async create(foodItem: CreateFoodDto): Promise<void> {
    await this.drizzle.db.insert(food).values(foodItem);
  }
}
