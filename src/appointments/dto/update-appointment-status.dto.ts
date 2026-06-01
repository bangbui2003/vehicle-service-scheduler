import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

const SETTABLE_STATUSES = [AppointmentStatus.IN_PROGRESS, AppointmentStatus.COMPLETED] as const;

export class UpdateAppointmentStatusDto {
  @ApiProperty({
    enum: SETTABLE_STATUSES,
    description: 'CONFIRMED→IN_PROGRESS (only after startTime) | IN_PROGRESS→COMPLETED',
  })
  @IsEnum(SETTABLE_STATUSES)
  status: typeof SETTABLE_STATUSES[number];
}
