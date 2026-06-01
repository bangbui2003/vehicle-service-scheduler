import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Appointment, AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { MetricsService } from '../metrics/metrics.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import {
  AppointmentCreatedEvent,
  AppointmentCancelledEvent,
  AppointmentStatusChangedEvent,
} from '../events/appointment.events';

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.CONFIRMED]:   [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CANCELLED],
  [AppointmentStatus.IN_PROGRESS]: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
  [AppointmentStatus.COMPLETED]:   [],
  [AppointmentStatus.CANCELLED]:   [],
};

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly metrics: MetricsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateAppointmentDto, idempotencyKey?: string): Promise<Appointment> {
    if (idempotencyKey) {
      const existing = await this.prisma.appointment.findUnique({
        where: { idempotencyKey },
        include: { customer: true, vehicle: true, technician: true, serviceBay: true },
      });
      if (existing) {
        this.logger.log({ msg: 'appointment.idempotent_hit', idempotencyKey, appointmentId: existing.id });
        return existing;
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

    this.logger.log({
      msg: 'Attempting to create appointment',
      dealershipId: dto.dealershipId,
      serviceType: dto.serviceType,
      startTime,
      endTime,
    });

    const appointment = await this.prisma.$transaction(async (tx) => {
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
      return tx.appointment.create({
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
    });

    this.metrics.appointmentBookings.inc({ outcome: 'created' });
    this.logger.log({
      msg: 'appointment.created',
      appointmentId: appointment.id,
      technicianId: appointment.technicianId,
      serviceBayId: appointment.serviceBayId,
    });
    this.eventEmitter.emit('appointment.created', new AppointmentCreatedEvent(appointment));

    return appointment;
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

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
      include: { customer: true, vehicle: true, technician: true, serviceBay: true },
    });

    this.logger.log({ msg: 'appointment.status_changed', appointmentId: id, from: appointment.status, to: dto.status });
    this.eventEmitter.emit(
      'appointment.status_changed',
      new AppointmentStatusChangedEvent(updated, appointment.status),
    );

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
  }): Promise<{ data: Appointment[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AppointmentWhereInput = {};

    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.dealershipId) where.dealershipId = filters.dealershipId;
    if (filters.date) {
      const day = new Date(filters.date);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      where.startTime = { gte: day, lt: nextDay };
    }

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: { customer: true, vehicle: true, technician: true, serviceBay: true },
        orderBy: { startTime: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async cancel(id: string): Promise<Appointment> {
    const appointment = await this.findOne(id);

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new ConflictException('Appointment is already cancelled');
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new ConflictException('Cannot cancel a completed appointment');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED },
      include: {
        customer: true,
        vehicle: true,
        technician: true,
        serviceBay: true,
      },
    });

    this.metrics.appointmentBookings.inc({ outcome: 'cancelled' });
    this.logger.log({ msg: 'appointment.cancelled', appointmentId: id });
    this.eventEmitter.emit('appointment.cancelled', new AppointmentCancelledEvent(updated));

    return updated;
  }
}
