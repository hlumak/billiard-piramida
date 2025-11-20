import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/drizzle/drizzle.service';
import { tables } from 'src/drizzle/schema';
import { CreateTableDto } from './dto/create-table.dto';
import { TableDto } from './dto/table.dto';

@Injectable()
export class TablesService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(): Promise<TableDto[]> {
    return this.drizzle.db.query.tables.findMany();
  }

  async create(table: CreateTableDto): Promise<void> {
    await this.drizzle.db.insert(tables).values(table);
  }
}
