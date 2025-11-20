import { OmitType } from '@nestjs/swagger';
import { TableDto } from './table.dto';

export class CreateTableDto extends OmitType(TableDto, ['id'] as const) {}
