import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsDateString, IsNotEmpty, IsString, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SERVICE_DURATIONS } from '../availability/availability.service';
import { SlotsService } from './slots.service';

class NextAvailableQuery {
  @IsString() @IsNotEmpty() dealershipId: string;
  @IsString() @IsNotEmpty() serviceType: string;
  @IsDateString() from: string;
}

@ApiTags('slots')
@SkipThrottle()
@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Get('next-available')
  @ApiOperation({
    summary: 'Find the next available time slot for a service',
    description: 'Returns the earliest window where both a ServiceBay and a qualified Technician are free. Searches up to 7 days ahead. Uses 3 DB queries regardless of search horizon.',
  })
  @ApiQuery({ name: 'dealershipId', required: true })
  @ApiQuery({ name: 'serviceType', required: true, enum: Object.keys(SERVICE_DURATIONS) })
  @ApiQuery({ name: 'from', required: true, example: '2026-07-01T09:00:00.000Z', description: 'Search start time (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Next available slot found or null if none in 7 days' })
  async findNextAvailable(
    @Query('dealershipId') dealershipId: string,
    @Query('serviceType') serviceType: string,
    @Query('from') from: string,
  ) {
    const query = plainToInstance(NextAvailableQuery, { dealershipId, serviceType, from });
    const errors = validateSync(query);
    if (errors.length > 0) throw new BadRequestException(errors.map((e) => Object.values(e.constraints ?? {})).flat());

    if (!SERVICE_DURATIONS[serviceType.toUpperCase()]) {
      throw new BadRequestException(`Unknown service type: ${serviceType}. Valid: ${Object.keys(SERVICE_DURATIONS).join(', ')}`);
    }

    const result = await this.slotsService.findNextAvailable(dealershipId, serviceType, new Date(from));
    return result ?? { message: 'No availability found within the next 7 days' };
  }
}
