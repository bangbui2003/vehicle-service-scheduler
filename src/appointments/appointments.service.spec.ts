import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { MetricsService } from '../metrics/metrics.service';
import { OutboxService } from '../outbox/outbox.service';
import { SlotsService } from '../slots/slots.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { BookingConflictException } from '../common/exceptions/booking-conflict.exception';
import { encodeCursor } from '../common/pagination/cursor.util';

const mockPrismaService = {
  $transaction: jest.fn(),
  appointment: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  idempotencyRecord: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
  },
};

const mockAvailabilityService = {
  computeEndTime: jest.fn(),
  findAvailableBay: jest.fn(),
  findAvailableTechnician: jest.fn(),
};

const mockMetricsService = {
  appointmentBookings: { inc: jest.fn() },
};

const mockOutboxService = {
  publish: jest.fn().mockResolvedValue(undefined),
};

const mockSlotsService = {
  findNextAvailable: jest.fn(),
};

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AvailabilityService, useValue: mockAvailabilityService },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: OutboxService, useValue: mockOutboxService },
        { provide: SlotsService, useValue: mockSlotsService },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto: CreateAppointmentDto = {
      customerId: 'customer-1',
      vehicleId: 'vehicle-1',
      dealershipId: 'dealership-1',
      serviceType: 'OIL_CHANGE',
      desiredStartTime: '2035-06-01T09:00:00.000Z', // Far in the future to pass date validation
    };

    const mockBay = { id: 'bay-1', name: 'Bay 1', dealershipId: 'dealership-1' };
    const mockTechnician = { id: 'tech-1', name: 'John', specializations: ['OIL_CHANGE'] };
    const mockAppointment = {
      id: 'appt-1',
      ...dto,
      technicianId: 'tech-1',
      serviceBayId: 'bay-1',
      status: 'CONFIRMED',
    };

    it('should create appointment when bay and technician are available and publish outbox event', async () => {
      const endTime = new Date('2035-06-01T10:00:00.000Z');
      mockAvailabilityService.computeEndTime.mockReturnValue(endTime);
      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        mockAvailabilityService.findAvailableBay.mockResolvedValue(mockBay);
        mockAvailabilityService.findAvailableTechnician.mockResolvedValue(mockTechnician);
        const tx = {
          appointment: { create: jest.fn().mockResolvedValue(mockAppointment) },
        };
        return cb(tx);
      });

      const result = await service.create(dto);
      expect(result).toEqual(mockAppointment);
      expect(mockOutboxService.publish).toHaveBeenCalledWith(
        expect.anything(),
        'appointment.created',
        { appointment: mockAppointment },
      );
    });

    it('should throw BookingConflictException with nextAvailableSlot when no bay is available', async () => {
      mockAvailabilityService.computeEndTime.mockReturnValue(new Date('2035-06-01T10:00:00.000Z'));
      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        mockAvailabilityService.findAvailableBay.mockResolvedValue(null);
        const tx = {};
        return cb(tx);
      });

      const mockSlot = { startTime: new Date('2035-06-02T09:00:00.000Z'), endTime: new Date('2035-06-02T10:00:00.000Z') };
      mockSlotsService.findNextAvailable.mockResolvedValue(mockSlot);

      await expect(service.create(dto)).rejects.toThrow(BookingConflictException);
      try {
        await service.create(dto);
      } catch (err: any) {
        expect(err.getResponse()).toEqual({
          statusCode: 409,
          message: 'No service bay available for the requested time slot',
          nextAvailableSlot: mockSlot,
        });
      }
      expect(mockSlotsService.findNextAvailable).toHaveBeenCalledWith(
        dto.dealershipId,
        dto.serviceType,
        expect.any(Date),
      );
    });

    it('should throw BookingConflictException with nextAvailableSlot when no technician is available', async () => {
      mockAvailabilityService.computeEndTime.mockReturnValue(new Date('2035-06-01T10:00:00.000Z'));
      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        mockAvailabilityService.findAvailableBay.mockResolvedValue(mockBay);
        mockAvailabilityService.findAvailableTechnician.mockResolvedValue(null);
        const tx = {};
        return cb(tx);
      });

      const mockSlot = { startTime: new Date('2035-06-02T11:00:00.000Z'), endTime: new Date('2035-06-02T12:00:00.000Z') };
      mockSlotsService.findNextAvailable.mockResolvedValue(mockSlot);

      await expect(service.create(dto)).rejects.toThrow(BookingConflictException);
      try {
        await service.create(dto);
      } catch (err: any) {
        expect(err.getResponse()).toEqual({
          statusCode: 409,
          message: 'No qualified technician available for OIL_CHANGE at the requested time',
          nextAvailableSlot: mockSlot,
        });
      }
    });

    it('should return saved response when idempotency record exists', async () => {
      const savedResponse = { ...mockAppointment, id: 'saved-appt' };
      mockPrismaService.idempotencyRecord.findUnique.mockResolvedValue({
        key: 'test-key',
        responseBody: JSON.stringify(savedResponse),
        statusCode: 201,
      });

      const result = await service.create(dto, 'test-key');
      expect(result).toEqual(savedResponse);
      expect(mockPrismaService.idempotencyRecord.findUnique).toHaveBeenCalledWith({
        where: { key: 'test-key' },
      });
      // Transaction should not be called
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if starting on Sunday', async () => {
      const sundayDto = {
        ...dto,
        desiredStartTime: '2035-06-03T09:00:00.000Z', // June 3rd, 2035 is a Sunday
      };
      mockAvailabilityService.computeEndTime.mockReturnValue(new Date('2035-06-03T09:45:00.000Z'));

      await expect(service.create(sundayDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(sundayDto)).rejects.toThrow('Dealership is closed on Sundays');
    });

    it('should throw BadRequestException if starting outside operating hours (before 08:00 UTC)', async () => {
      const earlyDto = {
        ...dto,
        desiredStartTime: '2035-06-01T07:30:00.000Z', // Friday 07:30 UTC
      };
      mockAvailabilityService.computeEndTime.mockReturnValue(new Date('2035-06-01T08:15:00.000Z'));

      await expect(service.create(earlyDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(earlyDto)).rejects.toThrow('Appointment start time must be within operating hours (08:00 - 17:00 UTC)');
    });

    it('should throw BadRequestException if ending outside operating hours (after 17:00 UTC)', async () => {
      const lateDto = {
        ...dto,
        desiredStartTime: '2035-06-01T16:30:00.000Z', // Friday 16:30 UTC
      };
      mockAvailabilityService.computeEndTime.mockReturnValue(new Date('2035-06-01T17:15:00.000Z')); // Ends 17:15

      await expect(service.create(lateDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(lateDto)).rejects.toThrow('Appointment end time must be within operating hours (08:00 - 17:00 UTC)');
    });

    it('should throw BadRequestException if start and end are on different days', async () => {
      const spanDto = {
        ...dto,
        desiredStartTime: '2035-06-01T23:00:00.000Z', // Friday 23:00 UTC
      };
      mockAvailabilityService.computeEndTime.mockReturnValue(new Date('2035-06-02T00:30:00.000Z')); // Saturday 00:30 UTC

      await expect(service.create(spanDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(spanDto)).rejects.toThrow('Appointments must start and end on the same day');
    });
  });

  describe('cancel', () => {
    it('should throw ConflictException when appointment is already cancelled', async () => {
      const cancelled = { id: 'appt-1', status: 'CANCELLED' };
      mockPrismaService.appointment.findUnique.mockResolvedValue(cancelled);

      await expect(service.cancel('appt-1')).rejects.toThrow(ConflictException);
      await expect(service.cancel('appt-1')).rejects.toThrow(
        'Appointment is already cancelled',
      );
    });

    it('should throw ConflictException when appointment is completed', async () => {
      const completed = { id: 'appt-1', status: 'COMPLETED' };
      mockPrismaService.appointment.findUnique.mockResolvedValue(completed);

      await expect(service.cancel('appt-1')).rejects.toThrow(ConflictException);
    });

    it('should cancel a confirmed appointment with optimistic lock check and publish to outbox', async () => {
      const confirmed = { id: 'appt-1', status: 'CONFIRMED', updatedAt: new Date('2030-01-01T00:00:00.000Z') };
      const cancelled = { ...confirmed, status: 'CANCELLED' };
      
      mockPrismaService.appointment.findUnique.mockResolvedValue(confirmed);
      
      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        const tx = {
          appointment: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue(cancelled),
          },
        };
        return cb(tx);
      });

      const result = await service.cancel('appt-1');
      expect(result.status).toBe('CANCELLED');
      expect(mockOutboxService.publish).toHaveBeenCalledWith(
        expect.anything(),
        'appointment.cancelled',
        { appointment: cancelled },
      );
    });

    it('should throw ConflictException on cancel if updateMany returns 0 (concurrency collision)', async () => {
      const confirmed = { id: 'appt-1', status: 'CONFIRMED', updatedAt: new Date('2030-01-01T00:00:00.000Z') };
      
      mockPrismaService.appointment.findUnique.mockResolvedValue(confirmed);
      
      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        const tx = {
          appointment: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return cb(tx);
      });

      await expect(service.cancel('appt-1')).rejects.toThrow(ConflictException);
      await expect(service.cancel('appt-1')).rejects.toThrow(
        'Appointment was modified by another request. Please reload and retry.',
      );
    });
  });

  describe('findAll', () => {
    const mockAppointments = [
      { id: 'appt-1', startTime: new Date('2035-06-01T09:00:00.000Z') },
      { id: 'appt-2', startTime: new Date('2035-06-01T10:00:00.000Z') },
    ];

    it('should fall back to offset pagination when cursor is not provided', async () => {
      mockPrismaService.appointment.findMany.mockResolvedValue(mockAppointments);
      mockPrismaService.appointment.count.mockResolvedValue(10);

      const result = await service.findAll({ page: 2, limit: 2 });
      expect(result).toEqual({
        data: mockAppointments,
        total: 10,
        page: 2,
        limit: 2,
      });
      expect(mockPrismaService.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 2,
          take: 2,
          orderBy: { startTime: 'asc' },
        }),
      );
    });

    it('should use cursor-based pagination when cursor is provided (hasMore = false)', async () => {
      mockPrismaService.appointment.findMany.mockResolvedValue([mockAppointments[1]]);
      const cursor = encodeCursor({ id: 'appt-1', startTime: '2035-06-01T09:00:00.000Z' });

      const result = await service.findAll({ cursor, limit: 2 });
      expect(result.data).toEqual([mockAppointments[1]]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should use cursor-based pagination and indicate hasMore = true if data size > limit', async () => {
      mockPrismaService.appointment.findMany.mockResolvedValue(mockAppointments);
      const cursor = encodeCursor({ id: 'appt-0', startTime: '2035-06-01T08:00:00.000Z' });

      const result = await service.findAll({ cursor, limit: 1 });
      expect(result.data).toEqual([mockAppointments[0]]);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
    });
  });
});
