import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const buildMockPrisma = () => ({
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $queryRaw: jest.fn().mockResolvedValue([]),
  $transaction: jest.fn(),
  appointment: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn(),
  },
});

describe('AppointmentsController (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  const validDto = {
    customerId: 'cust-uuid-1',
    vehicleId: 'veh-uuid-1',
    dealershipId: 'deal-uuid-1',
    serviceType: 'OIL_CHANGE',
    desiredStartTime: '2026-06-01T09:00:00.000Z',
  };

  const mockBay = { id: 'bay-1', name: 'Bay 1', dealership_id: 'deal-uuid-1' };
  const mockTech = { id: 'tech-1', name: 'John Smith', specializations: ['OIL_CHANGE'] };
  const mockAppointment = {
    id: 'appt-uuid-1',
    customerId: 'cust-uuid-1',
    vehicleId: 'veh-uuid-1',
    dealershipId: 'deal-uuid-1',
    technicianId: 'tech-1',
    serviceBayId: 'bay-1',
    serviceType: 'OIL_CHANGE',
    startTime: '2026-06-01T09:00:00.000Z',
    endTime: '2026-06-01T10:00:00.000Z',
    status: 'CONFIRMED',
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customer: { id: 'cust-uuid-1', name: 'Alice Johnson' },
    vehicle: { id: 'veh-uuid-1', make: 'Toyota' },
    technician: mockTech,
    serviceBay: mockBay,
  };

  beforeAll(async () => {
    mockPrisma = buildMockPrisma();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
  });

  // ─── POST /appointments ─────────────────────────────────────────────────────

  describe('POST /appointments', () => {
    it('returns 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/appointments')
        .send({})
        .expect(400);
    });

    it('returns 400 when serviceType is missing', () => {
      const { serviceType: _, ...withoutServiceType } = validDto;
      return request(app.getHttpServer())
        .post('/appointments')
        .send(withoutServiceType)
        .expect(400);
    });

    it('returns 400 when desiredStartTime is not a valid date string', () => {
      return request(app.getHttpServer())
        .post('/appointments')
        .send({ ...validDto, desiredStartTime: 'not-a-date' })
        .expect(400);
    });

    it('returns 400 when unknown fields are sent (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/appointments')
        .send({ ...validDto, unknownField: 'should-be-rejected' })
        .expect(400);
    });

    it('returns 409 when no service bay is available', () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        return cb({
          $queryRaw: jest.fn().mockResolvedValue([]), // empty = no bay
          appointment: { create: jest.fn() },
        });
      });

      return request(app.getHttpServer())
        .post('/appointments')
        .send(validDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toContain('No service bay available');
        });
    });

    it('returns 409 when no qualified technician is available', () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const txMock = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([mockBay])  // bay found
            .mockResolvedValueOnce([]),         // no technician
          appointment: { create: jest.fn() },
        };
        return cb(txMock);
      });

      return request(app.getHttpServer())
        .post('/appointments')
        .send(validDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toContain('No qualified technician');
        });
    });

    it('returns 201 and the created appointment when both resources are available', () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const txMock = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([mockBay])
            .mockResolvedValueOnce([mockTech]),
          appointment: { create: jest.fn().mockResolvedValue(mockAppointment) },
        };
        return cb(txMock);
      });

      return request(app.getHttpServer())
        .post('/appointments')
        .send(validDto)
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBe('appt-uuid-1');
          expect(res.body.status).toBe('CONFIRMED');
          expect(res.body.serviceType).toBe('OIL_CHANGE');
        });
    });
  });

  // ─── GET /appointments ──────────────────────────────────────────────────────

  describe('GET /appointments', () => {
    it('returns 200 with paginated envelope when there are no appointments', () => {
      mockPrisma.appointment.findMany.mockResolvedValue([]);
      mockPrisma.appointment.count.mockResolvedValue(0);

      return request(app.getHttpServer())
        .get('/appointments')
        .expect(200)
        .expect({ data: [], total: 0, page: 1, limit: 20 });
    });

    it('returns 200 and filters by dealershipId query param', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([mockAppointment]);
      mockPrisma.appointment.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/appointments?dealershipId=deal-uuid-1')
        .expect(200);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dealershipId: 'deal-uuid-1' }),
        }),
      );
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('returns 200 with correct page and limit when provided', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([]);
      mockPrisma.appointment.count.mockResolvedValue(50);

      const res = await request(app.getHttpServer())
        .get('/appointments?page=2&limit=10')
        .expect(200);

      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(10);
      expect(res.body.total).toBe(50);
    });
  });

  // ─── GET /appointments/:id ──────────────────────────────────────────────────

  describe('GET /appointments/:id', () => {
    it('returns 404 when the appointment does not exist', () => {
      mockPrisma.appointment.findUnique.mockResolvedValue(null);

      return request(app.getHttpServer())
        .get('/appointments/non-existent-id')
        .expect(404);
    });

    it('returns 200 with the appointment when found', () => {
      mockPrisma.appointment.findUnique.mockResolvedValue(mockAppointment);

      return request(app.getHttpServer())
        .get('/appointments/appt-uuid-1')
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe('appt-uuid-1');
        });
    });
  });

  // ─── DELETE /appointments/:id ───────────────────────────────────────────────

  describe('DELETE /appointments/:id', () => {
    it('returns 404 when the appointment does not exist', () => {
      mockPrisma.appointment.findUnique.mockResolvedValue(null);

      return request(app.getHttpServer())
        .delete('/appointments/non-existent-id')
        .expect(404);
    });

    it('returns 409 when the appointment is already cancelled', () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-uuid-1',
        status: 'CANCELLED',
      });

      return request(app.getHttpServer())
        .delete('/appointments/appt-uuid-1')
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toContain('already cancelled');
        });
    });

    it('returns 409 when the appointment is already completed', () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-uuid-1',
        status: 'COMPLETED',
      });

      return request(app.getHttpServer())
        .delete('/appointments/appt-uuid-1')
        .expect(409);
    });

    it('returns 200 with the cancelled appointment when cancellation succeeds', () => {
      const confirmed = { id: 'appt-uuid-1', status: 'CONFIRMED' };
      const cancelled = { ...mockAppointment, status: 'CANCELLED' };

      mockPrisma.appointment.findUnique.mockResolvedValue(confirmed);
      mockPrisma.appointment.update.mockResolvedValue(cancelled);

      return request(app.getHttpServer())
        .delete('/appointments/appt-uuid-1')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('CANCELLED');
        });
    });
  });
});
