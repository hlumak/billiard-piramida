import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserDto, FindOneParams, UserDto } from './dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Get all users' })
  @ApiOkResponse({
    description: 'List of all users',
    type: [UserDto]
  })
  @Get()
  async findAll(): Promise<UserDto[]> {
    return this.usersService.findAll();
  }

  @ApiOperation({ summary: 'Get one user by phone' })
  @ApiOkResponse({
    description: 'One user object',
    type: UserDto
  })
  @Get(':phone')
  async findOne(@Param() params: FindOneParams): Promise<UserDto> {
    return this.usersService.findOne(params.phone);
  }

  @ApiOperation({ summary: 'Create user' })
  @ApiCreatedResponse({ description: 'The user has has been successfully created' })
  @Post()
  async create(@Body() user: CreateUserDto): Promise<void> {
    await this.usersService.create(user);
  }
}
