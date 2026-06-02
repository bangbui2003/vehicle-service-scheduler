import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Appointment, AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { MetricsService } from '../metrics/metrics.service';
import { OutboxService } from '../outbox/outbox.service';
import { SlotsService, NextAvailableSlot } from '../slots/slots.service';
import { BookingConflictException } from '../common/exceptions/booking-conflict.exception';
import { encodeCursor, decodeCursor } from '../common/pagination/cursor.util';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.CONFIRMED]:   [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CANCELLED],
  [AppointmentStatus.IN_PROGRESS]: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
  [AppointmentStatus.COMPLETED]:   [],
  [AppointmentStatus.CANCELLED]:   [],
};

export interface PaginatedAppointments {
  data: Appointment[];
  total?: number;
  page?: number;
  limit: number;
  nextCursor?: string | null;
  hasMore?: boolean;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly metrics: MetricsService,
    private readonly outbox: OutboxService,
    private readonly slotsService: SlotsService,
  ) {}

  private validateOperatingHours(start: Date, end: Date): void {
    // Must be on the same UTC day
    const startYear = start.getUTCFullYear();
    const startMonth = start.getUTCMonth();
    const startDate = start.getUTCDate();

    const endYear = end.getUTCFullYear();
    const endMonth = end.getUTCMonth();
    const endDate = end.getUTCDate();

    if (startYear !== endYear || startMonth !== endMonth || startDate !== endDate) {
      throw new BadRequestException('Appointments must start and end on the same day');
    }

    const startDay = start.getUTCDay();
    const endDay = end.getUTCDay();

    // Sunday = 0
    if (startDay === 0 || endDay === 0) {
      throw new BadRequestException('Dealership is closed on Sundays');
    }

    // Operating hours: 08:00 to 17:00 UTC
    const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
    const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes();

    const openMinutes = 8 * 60;   // 08:00
    const closeMinutes = 17 * 60; // 17:00

    if (startMinutes < openMinutes || startMinutes > closeMinutes) {
      throw new BadRequestException('Appointment start time must be within operating hours (08:00 - 17:00 UTC)');
    }
    if (endMinutes < openMinutes || endMinutes > closeMinutes) {
      throw new BadRequestException('Appointment end time must be within operating hours (08:00 - 17:00 UTC)');
    }
  }

  async create(dto: CreateAppointmentDto, idempotencyKey?: string): Promise<Appointment> {
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });
      if (existing) {
        this.logger.log({ msg: 'appointment.idempotent_hit', idempotencyKey });
        return JSON.parse(existing.responseBody);
      }
    }

    const startTime = new Date(dto.desiredStartTime);

    if (startTime <= new Date()) {
      throw new BadRequestException('Appointment start time must be in the future');
    }

    const endTime = this.availabilityService.computeEndTime(
      startTime,
      dto.serviceType,
    );

    this.validateOperatingHours(startTime, endTime);

    this.logger.log({
      msg: 'Attempting to create appointment',
      dealershipId: dto.dealershipId,
      serviceType: dto.serviceType,
      startTime,
      endTime,
    });

    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.idempotencyRecord.findUnique({
            where: { key: idempotencyKey },
          });
          if (existing) {
            return JSON.parse(existing.responseBody);
          }
        }

        // 1. Find available service bay
        const bay = await this.availabilityService.findAvailableBay(
          tx as any,
          dto.dealershipId,
          startTime,
          endTime,
        );

        if (!bay) {
          this.logger.warn({
            msg: 'No available service bay',
            dealershipId: dto.dealershipId,
            startTime,
            endTime,
          });
          this.metrics.appointmentBookings.inc({ outcome: 'conflict_bay' });
          throw new ConflictException(
            'No service bay available for the requested time slot',
          );
        }

        // 2. Find available technician
        const technician = await this.availabilityService.findAvailableTechnician(
          tx as any,
          dto.dealershipId,
          dto.serviceType,
          startTime,
          endTime,
        );

        if (!technician) {
          this.logger.warn({
            msg: 'No available technician',
            dealershipId: dto.dealershipId,
            serviceType: dto.serviceType,
            startTime,
            endTime,
          });
          this.metrics.appointmentBookings.inc({ outcome: 'conflict_tech' });
          throw new ConflictException(
            `No qualified technician available for ${dto.serviceType} at the requested time`,
          );
        }

        // 3. Create the appointment record
        const appt = await tx.appointment.create({
          data: {
            customerId: dto.customerId,
            vehicleId: dto.vehicleId,
            dealershipId: dto.dealershipId,
            technicianId: technician.id,
            serviceBayId: bay.id,
            serviceType: dto.serviceType.toUpperCase(),
            startTime,
            endTime,
            status: AppointmentStatus.CONFIRMED,
            notes: dto.notes,
            idempotencyKey: idempotencyKey ?? null,
          },
          include: {
            customer: true,
            vehicle: true,
            technician: true,
            serviceBay: true,
          },
        });

        // 4. Save response to IdempotencyRecord table inside the same transaction
        if (idempotencyKey) {
          await tx.idempotencyRecord.create({
            data: {
              key: idempotencyKey,
              responseBody: JSON.stringify(appt),
              statusCode: 201,
            },
          });
        }

        // 5. Write event to outbox inside the same transaction
        await this.outbox.publish(tx, 'appointment.created', { appointment: appt });

        return appt;
      });

      this.metrics.appointmentBookings.inc({ outcome: 'created' });
      this.logger.log({
        msg: 'appointment.created',
        appointmentId: appointment.id,
        technicianId: appointment.technicianId,
        serviceBayId: appointment.serviceBayId,
      });

      return appointment;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (idempotencyKey) {
          const existing = await this.prisma.idempotencyRecord.findUnique({
            where: { key: idempotencyKey },
          });
          if (existing) {
            this.logger.log({ msg: 'appointment.idempotent_hit_concurrency', idempotencyKey });
            return JSON.parse(existing.responseBody);
          }
        }
      }
      // Catch ConflictException and enrich it with the next available slot
      if (error instanceof ConflictException) {
        const nextAvailableSlot = await this.slotsService.findNextAvailable(
          dto.dealershipId,
          dto.serviceType,
          startTime,
        );
        throw new BookingConflictException(
          error.message,
          nextAvailableSlot || undefined,
        );
      }
      throw error;
    }
  }

  async updateStatus(id: string, dto: UpdateAppointmentStatusDto): Promise<Appointment> {
    const appointment = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[appointment.status];

    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `Cannot transition from ${appointment.status} to ${dto.status}`,
      );
    }

    if (dto.status === AppointmentStatus.IN_PROGRESS && new Date() < appointment.startTime) {
      throw new BadRequestException(
        'Cannot mark appointment as IN_PROGRESS before its scheduled start time',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.appointment.updateMany({
        where: {
          id,
          updatedAt: appointment.updatedAt,
        },
        data: {
          status: dto.status,
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Appointment was modified by another request. Please reload and retry.',
        );
      }

      const appt = await tx.appointment.findUnique({
        where: { id },
        include: {
          customer: true,
          vehicle: true,
          technician: true,
          serviceBay: true,
        },
      });

      if (!appt) {
        throw new NotFoundException(`Appointment ${id} not found`);
      }

      await this.outbox.publish(tx, 'appointment.status_changed', {
        appointment: appt,
        previousStatus: appointment.status,
      });

      return appt;
    });

    this.logger.log({ msg: 'appointment.status_changed', appointmentId: id, from: appointment.status, to: dto.status });
    
    return updated;
  }

  async findOne(id: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        customer: true,
        vehicle: true,
        technician: true,
        serviceBay: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }

    return appointment;
  }

  async findAll(filters: {
    customerId?: string;
    dealershipId?: string;
    date?: string;
    page?: number;
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedAppointments> {
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const where: Prisma.AppointmentWhereInput = {};

    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.dealershipId) where.dealershipId = filters.dealershipId;
    if (filters.date) {
      const day = new Date(filters.date);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      where.startTime = { gte: day, lt: nextDay };
    }

    // Cursor-based pagination branch
    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        const cursorTime = new Date(decoded.startTime);
        where.OR = [
          {
            startTime: { gt: cursorTime },
          },
          {
            startTime: cursorTime,
            id: { gt: decoded.id },
          },
        ];
      }
    }

    if (filters.cursor) {
      // Fetch limit + 1 items to see if hasMore is true
      const data = await this.prisma.appointment.findMany({
        where,
        include: { customer: true, vehicle: true, technician: true, serviceBay: true },
        orderBy: [
          { startTime: 'asc' },
          { id: 'asc' },
        ],
        take: limit + 1,
      });

      const hasMore = data.length > limit;
      const resultData = hasMore ? data.slice(0, limit) : data;
      
      let nextCursor: string | null = null;
      if (hasMore && resultData.length > 0) {
        const lastItem = resultData[resultData.length - 1];
        nextCursor = encodeCursor({
          id: lastItem.id,
          startTime: lastItem.startTime.toISOString(),
        });
      }

      return {
        data: resultData,
        limit,
        nextCursor,
        hasMore,
      };
    } else {
      // Offset pagination branch
      const page = Math.max(1, filters.page ?? 1);
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.prisma.appointment.findMany({
          where,
          include: { customer: true, vehicle: true, technician: true, serviceBay: true },
          orderBy: [
            { startTime: 'asc' },
            { id: 'asc' },
          ],
          skip,
          take: limit,
        }),
        this.prisma.appointment.count({ where }),
      ]);

      const hasMore = total > skip + data.length;
      let nextCursor: string | null = null;
      if (hasMore && data.length > 0) {
        const lastItem = data[data.length - 1];
        nextCursor = encodeCursor({
          id: lastItem.id,
          startTime: lastItem.startTime.toISOString(),
        });
      }

      return {
        data,
        total,
        page,
        limit,
        nextCursor,
      };
    }
  }

  async cancel(id: string): Promise<Appointment> {
    const appointment = await this.findOne(id);

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new ConflictException('Appointment is already cancelled');
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new ConflictException('Cannot cancel a completed appointment');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.appointment.updateMany({
        where: {
          id,
          updatedAt: appointment.updatedAt,
        },
        data: {
          status: AppointmentStatus.CANCELLED,
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Appointment was modified by another request. Please reload and retry.',
        );
      }

      const appt = await tx.appointment.findUnique({
        where: { id },
        include: {
          customer: true,
          vehicle: true,
          technician: true,
          serviceBay: true,
        },
      });

      if (!appt) {
        throw new NotFoundException(`Appointment ${id} not found`);
      }

      await this.outbox.publish(tx, 'appointment.cancelled', { appointment: appt });

      return appt;
    });

    this.metrics.appointmentBookings.inc({ outcome: 'cancelled' });
    this.logger.log({ msg: 'appointment.cancelled', appointmentId: id });

    return updated;
  }
}
