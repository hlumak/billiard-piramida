import { OmitType } from '@nestjs/swagger';
import { FoodDto } from './food.dto';

export class CreateFoodDto extends OmitType(FoodDto, ['id', 'createdAt', 'updatedAt'] as const) {}
