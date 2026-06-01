import { Appointment } from '@prisma/client';

export class AppointmentCreatedEvent {
  constructor(public readonly appointment: Appointment) {}
}

export class AppointmentCancelledEvent {
  constructor(public readonly appointment: Appointment) {}
}

export class AppointmentStatusChangedEvent {
  constructor(
    public readonly appointment: Appointment,
    public readonly previousStatus: string,
  ) {}
}
