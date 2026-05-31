import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  const mockPrisma = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    appointment: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 and status ok when database is reachable', () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('GET /health returns 503 when database is unreachable', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

    return request(app.getHttpServer())
      .get('/health')
      .expect(503);
  });
});
