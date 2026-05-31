import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { MetricsService } from '../metrics/metrics.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

const mockPrismaService = {
  $transaction: jest.fn(),
  appointment: {
    findUnique: jest.fn().mockResolvedValue(null), // no idempotency hit by default
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
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

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AvailabilityService, useValue: mockAvailabilityService },
        { provide: MetricsService, useValue: mockMetricsService },
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
      desiredStartTime: '2026-06-01T09:00:00.000Z',
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

    it('should create appointment when bay and technician are available', async () => {
      const endTime = new Date('2026-06-01T10:00:00.000Z');
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
    });

    it('should throw ConflictException when no bay is available', async () => {
      mockAvailabilityService.computeEndTime.mockReturnValue(new Date());
      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        mockAvailabilityService.findAvailableBay.mockResolvedValue(null);
        const tx = {};
        return cb(tx);
      });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        'No service bay available for the requested time slot',
      );
    });

    it('should throw ConflictException when no technician is available', async () => {
      mockAvailabilityService.computeEndTime.mockReturnValue(new Date());
      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        mockAvailabilityService.findAvailableBay.mockResolvedValue(mockBay);
        mockAvailabilityService.findAvailableTechnician.mockResolvedValue(null);
        const tx = {};
        return cb(tx);
      });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        'No qualified technician available',
      );
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

    it('should cancel a confirmed appointment', async () => {
      const confirmed = { id: 'appt-1', status: 'CONFIRMED' };
      const cancelled = { ...confirmed, status: 'CANCELLED' };
      mockPrismaService.appointment.findUnique.mockResolvedValue(confirmed);
      mockPrismaService.appointment.update.mockResolvedValue(cancelled);

      const result = await service.cancel('appt-1');
      expect(result.status).toBe('CANCELLED');
    });
  });
});
