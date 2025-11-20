import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateTableDto } from './dto/create-table.dto';
import { TableDto } from './dto/table.dto';
import { TablesService } from './tables.service';

@ApiTags('tables')
@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @ApiOperation({ description: 'Get all the tables' })
  @Get()
  async findAll(): Promise<TableDto[]> {
    return this.tablesService.findAll();
  }

  @ApiOperation({ description: 'Create a new table' })
  @Post()
  async create(@Body() table: CreateTableDto): Promise<void> {
    await this.tablesService.create(table);
  }
}
