import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'uuid-customer-id' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 'uuid-vehicle-id' })
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({ example: 'uuid-dealership-id' })
  @IsString()
  @IsNotEmpty()
  dealershipId: string;

  @ApiProperty({ example: 'OIL_CHANGE', enum: ['OIL_CHANGE', 'TIRE_ROTATION', 'BRAKE_REPAIR', 'FULL_SERVICE', 'INSPECTION', 'BATTERY_REPLACEMENT'] })
  @IsString()
  @IsNotEmpty()
  serviceType: string;

  @ApiProperty({ example: '2026-06-01T09:00:00.000Z' })
  @IsDateString()
  desiredStartTime: string;

  @ApiProperty({ required: false, example: 'Please check brake pads as well' })
  @IsString()
  @IsOptional()
  notes?: string;
}
