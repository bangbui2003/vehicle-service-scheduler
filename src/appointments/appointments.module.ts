import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AvailabilityModule } from '../availability/availability.module';
import { OutboxModule } from '../outbox/outbox.module';
import { SlotsModule } from '../slots/slots.module';

@Module({
  imports: [AvailabilityModule, OutboxModule, SlotsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  // MetricsModule is @Global() — no import needed
  // EventEmitterModule is registered at AppModule level — EventEmitter2 is injected automatically
})
export class AppointmentsModule {}
