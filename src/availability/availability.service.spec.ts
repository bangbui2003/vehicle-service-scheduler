import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  $queryRaw: jest.fn(),
};

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
    jest.clearAllMocks();
  });

  describe('getServiceDuration', () => {
    it('should return correct duration for known service types', () => {
      expect(service.getServiceDuration('OIL_CHANGE')).toBe(45);
      expect(service.getServiceDuration('BRAKE_REPAIR')).toBe(120);
      expect(service.getServiceDuration('INSPECTION')).toBe(30);
    });

    it('should be case-insensitive', () => {
      expect(service.getServiceDuration('oil_change')).toBe(45);
      expect(service.getServiceDuration('Oil_Change')).toBe(45);
    });

    it('should throw for unknown service type', () => {
      expect(() => service.getServiceDuration('UNKNOWN_SERVICE')).toThrow(
        'Unknown service type: UNKNOWN_SERVICE',
      );
    });
  });

  describe('computeEndTime', () => {
    it('should compute correct end time', () => {
      const start = new Date('2026-06-01T09:00:00.000Z');
      const end = service.computeEndTime(start, 'OIL_CHANGE'); // 45 min
      expect(end.toISOString()).toBe('2026-06-01T09:45:00.000Z');
    });

    it('should handle 2-hour services', () => {
      const start = new Date('2026-06-01T09:00:00.000Z');
      const end = service.computeEndTime(start, 'BRAKE_REPAIR'); // 120 min
      expect(end.toISOString()).toBe('2026-06-01T11:00:00.000Z');
    });
  });

  describe('findAvailableBay', () => {
    const start = new Date('2026-06-01T09:00:00.000Z');
    const end = new Date('2026-06-01T10:00:00.000Z');

    it('should return a bay when one is available', async () => {
      const mockBay = { id: 'bay-1', name: 'Bay 1', dealership_id: 'dealership-1' };
      const mockTx = { $queryRaw: jest.fn().mockResolvedValue([mockBay]) };

      const result = await service.findAvailableBay(mockTx as any, 'dealership-1', start, end);
      expect(result).toEqual(mockBay);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return null when no bay is available', async () => {
      const mockTx = { $queryRaw: jest.fn().mockResolvedValue([]) };

      const result = await service.findAvailableBay(mockTx as any, 'dealership-1', start, end);
      expect(result).toBeNull();
    });
  });

  describe('findAvailableTechnician', () => {
    const start = new Date('2026-06-01T09:00:00.000Z');
    const end = new Date('2026-06-01T10:00:00.000Z');

    it('should return a technician when one is available', async () => {
      const mockTech = { id: 'tech-1', name: 'John', specializations: ['OIL_CHANGE'] };
      const mockTx = { $queryRaw: jest.fn().mockResolvedValue([mockTech]) };

      const result = await service.findAvailableTechnician(mockTx as any, 'dealership-1', 'OIL_CHANGE', start, end);
      expect(result).toEqual(mockTech);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should return null when no technician is available', async () => {
      const mockTx = { $queryRaw: jest.fn().mockResolvedValue([]) };

      const result = await service.findAvailableTechnician(mockTx as any, 'dealership-1', 'OIL_CHANGE', start, end);
      expect(result).toBeNull();
    });
  });
});
