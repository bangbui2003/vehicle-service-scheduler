import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AppointmentCreatedEvent,
  AppointmentCancelledEvent,
  AppointmentStatusChangedEvent,
} from './appointment.events';

@Injectable()
export class AppointmentEventsListener {
  private readonly logger = new Logger(AppointmentEventsListener.name);

  @OnEvent('appointment.created')
  handleCreated(event: AppointmentCreatedEvent) {
    this.logger.log({
      msg: 'event:appointment.created',
      appointmentId: event.appointment.id,
      dealershipId: event.appointment.dealershipId,
      serviceType: event.appointment.serviceType,
      startTime: event.appointment.startTime,
    });
  }

  @OnEvent('appointment.cancelled')
  handleCancelled(event: AppointmentCancelledEvent) {
    this.logger.log({
      msg: 'event:appointment.cancelled',
      appointmentId: event.appointment.id,
      dealershipId: event.appointment.dealershipId,
    });
  }

  @OnEvent('appointment.status_changed')
  handleStatusChanged(event: AppointmentStatusChangedEvent) {
    this.logger.log({
      msg: 'event:appointment.status_changed',
      appointmentId: event.appointment.id,
      from: event.previousStatus,
      to: event.appointment.status,
    });
  }
}
