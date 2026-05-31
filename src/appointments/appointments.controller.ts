import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new appointment' })
  @ApiResponse({ status: 201, description: 'Appointment created successfully' })
  @ApiResponse({ status: 409, description: 'No available bay or technician' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List appointments with optional filters' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'dealershipId', required: false })
  @ApiQuery({ name: 'date', required: false, example: '2026-06-01' })
  findAll(
    @Query('customerId') customerId?: string,
    @Query('dealershipId') dealershipId?: string,
    @Query('date') date?: string,
  ) {
    return this.appointmentsService.findAll({ customerId, dealershipId, date });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single appointment by ID' })
  @ApiResponse({ status: 200, description: 'Appointment found' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an appointment' })
  @ApiResponse({ status: 200, description: 'Appointment cancelled' })
  @ApiResponse({ status: 409, description: 'Cannot cancel this appointment' })
  cancel(@Param('id') id: string) {
    return this.appointmentsService.cancel(id);
  }
}
