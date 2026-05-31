import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new vehicle' })
  @ApiResponse({ status: 201, description: 'Vehicle registered' })
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List vehicles, optionally filtered by customer' })
  @ApiQuery({ name: 'customerId', required: false })
  findAll(@Query('customerId') customerId?: string) {
    return this.vehiclesService.findAll(customerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a vehicle by ID' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a vehicle' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
