import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AvailabilityModule } from './availability/availability.module';
import { ServiceBaysModule } from './service-bays/service-bays.module';
import { TechniciansModule } from './technicians/technicians.module';
import { CustomersModule } from './customers/customers.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { SlotsModule } from './slots/slots.module';
import { AppointmentEventsListener } from './events/appointment-events.listener';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        customProps: () => ({ context: 'HTTP' }),
        serializers: {
          req(req) {
            return { method: req.method, url: req.url, id: req.id };
          },
        },
      },
    }),
    PrismaModule,
    AvailabilityModule,
    AppointmentsModule,
    ServiceBaysModule,
    TechniciansModule,
    CustomersModule,
    VehiclesModule,
    HealthModule,
    MetricsModule,
    SlotsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AppointmentEventsListener,
  ],
})
export class AppModule {}
