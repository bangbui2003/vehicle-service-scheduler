import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceBay, Technician } from '@prisma/client';
import { ServiceCatalog } from '../appointments/constants/service-catalog';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  getServiceDuration(serviceType: string): number {
    const duration = ServiceCatalog[serviceType.toUpperCase()];
    if (!duration) {
      throw new Error(`Unknown service type: ${serviceType}`);
    }
    return duration;
  }

  computeEndTime(startTime: Date, serviceType: string): Date {
    const durationMinutes = this.getServiceDuration(serviceType);
    return new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  }

  /**
   * Find an available ServiceBay at the given dealership for the time window.
   * Uses raw SQL with FOR UPDATE SKIP LOCKED for concurrency safety.
   * Must be called inside a Prisma transaction.
   */
  async findAvailableBay(
    tx: Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
    dealershipId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<ServiceBay | null> {
    // Find a bay not booked during the requested window
    const results = await tx.$queryRaw<ServiceBay[]>`
      SELECT sb.*
      FROM service_bays sb
      WHERE sb.dealership_id = ${dealershipId}
        AND sb.id NOT IN (
          SELECT a.service_bay_id
          FROM appointments a
          WHERE a.status != 'CANCELLED'
            AND a.start_time < ${endTime}
            AND a.end_time > ${startTime}
        )
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    return results[0] ?? null;
  }

  /**
   * Find an available Technician qualified for the service type at the given dealership.
   * Must be called inside a Prisma transaction.
   */
  async findAvailableTechnician(
    tx: Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
    dealershipId: string,
    serviceType: string,
    startTime: Date,
    endTime: Date,
  ): Promise<Technician | null> {
    const results = await tx.$queryRaw<Technician[]>`
      SELECT t.*
      FROM technicians t
      WHERE t.dealership_id = ${dealershipId}
        AND ${serviceType.toUpperCase()} = ANY(t.specializations)
        AND t.id NOT IN (
          SELECT a.technician_id
          FROM appointments a
          WHERE a.status != 'CANCELLED'
            AND a.start_time < ${endTime}
            AND a.end_time > ${startTime}
        )
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    return results[0] ?? null;
  }
}
