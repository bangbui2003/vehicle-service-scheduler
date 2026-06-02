import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Create a new appointment' })
  @ApiResponse({ status: 201, description: 'Appointment created successfully' })
  @ApiResponse({
    status: 409,
    description: 'No available bay or technician. Returns next available slot if one exists.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'No service bay available for the requested time slot' },
        nextAvailableSlot: {
          type: 'object',
          nullable: true,
          properties: {
            startTime: { type: 'string', format: 'date-time', example: '2026-06-02T09:00:00.000Z' },
            endTime: { type: 'string', format: 'date-time', example: '2026-06-02T10:00:00.000Z' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  create(
    @Body() dto: CreateAppointmentDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.create(dto, idempotencyKey);
  }

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'List appointments with optional filters and pagination (offset or cursor)' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'dealershipId', required: false })
  @ApiQuery({ name: 'date', required: false, example: '2026-06-01' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Offset page number. Ignored if cursor is passed.' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Max 100' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque base64url cursor for index seek O(1) pagination' })
  findAll(
    @Query('customerId') customerId?: string,
    @Query('dealershipId') dealershipId?: string,
    @Query('date') date?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.appointmentsService.findAll({ customerId, dealershipId, date, page, limit, cursor });
  }

  @Get(':id')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get a single appointment by ID' })
  @ApiResponse({ status: 200, description: 'Appointment found' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update appointment status (state machine)' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 400, description: 'Cannot set IN_PROGRESS before start time' })
  @ApiResponse({ status: 409, description: 'Invalid state transition or concurrent modification conflict' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateAppointmentStatusDto) {
    return this.appointmentsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an appointment' })
  @ApiResponse({ status: 200, description: 'Appointment cancelled' })
  @ApiResponse({ status: 409, description: 'Cannot cancel this appointment or concurrent modification conflict' })
  cancel(@Param('id') id: string) {
    return this.appointmentsService.cancel(id);
  }
}
