import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateFoodDto } from './dto/create-food.dto';
import { FoodDto } from './dto/food.dto';
import { FoodService } from './food.service';

@ApiTags('food')
@Controller('food')
export class FoodController {
  constructor(private readonly foodService: FoodService) {}

  @ApiOperation({ description: 'Get all food items' })
  @Get()
  async findAll(): Promise<FoodDto[]> {
    return this.foodService.findAll();
  }

  @ApiOperation({ description: 'Create food item' })
  @Post()
  async create(@Body() foodItem: CreateFoodDto): Promise<void> {
    await this.foodService.create(foodItem);
  }
}
