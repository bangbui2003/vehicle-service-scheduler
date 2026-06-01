import { Module } from '@nestjs/common';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [AvailabilityModule],
  controllers: [SlotsController],
  providers: [SlotsService],
})
export class SlotsModule {}
