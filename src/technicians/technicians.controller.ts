import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TechniciansService } from './technicians.service';
import { CreateTechnicianDto } from './dto/create-technician.dto';

@ApiTags('technicians')
@Controller('technicians')
export class TechniciansController {
  constructor(private readonly techniciansService: TechniciansService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new technician' })
  @ApiResponse({ status: 201, description: 'Technician registered' })
  create(@Body() dto: CreateTechnicianDto) {
    return this.techniciansService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List technicians, optionally filtered by dealership' })
  @ApiQuery({ name: 'dealershipId', required: false })
  findAll(@Query('dealershipId') dealershipId?: string) {
    return this.techniciansService.findAll(dealershipId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a technician by ID' })
  @ApiResponse({ status: 404, description: 'Technician not found' })
  findOne(@Param('id') id: string) {
    return this.techniciansService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a technician' })
  @ApiResponse({ status: 404, description: 'Technician not found' })
  remove(@Param('id') id: string) {
    return this.techniciansService.remove(id);
  }
}
