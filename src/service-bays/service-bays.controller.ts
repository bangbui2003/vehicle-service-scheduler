import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ServiceBaysService } from './service-bays.service';
import { CreateServiceBayDto } from './dto/create-service-bay.dto';

@ApiTags('service-bays')
@Controller('service-bays')
export class ServiceBaysController {
  constructor(private readonly serviceBaysService: ServiceBaysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new service bay' })
  @ApiResponse({ status: 201, description: 'Service bay created' })
  create(@Body() dto: CreateServiceBayDto) {
    return this.serviceBaysService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List service bays, optionally filtered by dealership' })
  @ApiQuery({ name: 'dealershipId', required: false })
  findAll(@Query('dealershipId') dealershipId?: string) {
    return this.serviceBaysService.findAll(dealershipId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a service bay by ID' })
  @ApiResponse({ status: 404, description: 'Service bay not found' })
  findOne(@Param('id') id: string) {
    return this.serviceBaysService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a service bay' })
  @ApiResponse({ status: 404, description: 'Service bay not found' })
  remove(@Param('id') id: string) {
    return this.serviceBaysService.remove(id);
  }
}
