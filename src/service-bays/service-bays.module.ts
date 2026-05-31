import { Module } from '@nestjs/common';
import { ServiceBaysController } from './service-bays.controller';
import { ServiceBaysService } from './service-bays.service';

@Module({
  controllers: [ServiceBaysController],
  providers: [ServiceBaysService],
})
export class ServiceBaysModule {}
