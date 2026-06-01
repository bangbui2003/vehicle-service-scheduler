import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [AvailabilityModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  // MetricsModule is @Global() — no import needed
  // EventEmitterModule is registered at AppModule level — EventEmitter2 is injected automatically
})
export class AppointmentsModule {}
