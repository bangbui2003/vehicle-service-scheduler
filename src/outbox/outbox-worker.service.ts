import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppointmentCreatedEvent,
  AppointmentCancelledEvent,
  AppointmentStatusChangedEvent,
} from '../events/appointment.events';

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 10;

/**
 * OutboxWorker — the delivery side of the Transactional Outbox Pattern.
 *
 * Polls outbox_events every 500 ms for PENDING rows using
 * SELECT FOR UPDATE SKIP LOCKED — the same concurrency primitive as the
 * booking availability query — so multiple service instances never
 * double-deliver the same event.
 *
 * Current delivery target: in-process EventEmitter2.
 * Migration to a real broker (RabbitMQ / Kafka / SQS) requires changing only
 * the dispatch() method below. AppointmentsService is untouched.
 */
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private handle: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.handle = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    this.logger.log({ msg: 'OutboxWorker started', pollIntervalMs: POLL_INTERVAL_MS });
  }

  onModuleDestroy(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.logger.log({ msg: 'OutboxWorker stopped' });
    }
  }

  private async poll(): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string; event_type: string; payload: unknown }>
        >`
          SELECT id, event_type, payload
          FROM outbox_events
          WHERE status = 'PENDING'
          ORDER BY created_at ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        `;

        if (rows.length === 0) return;

        for (const row of rows) {
          try {
            this.dispatch(row.event_type, row.payload as Record<string, unknown>);

            await tx.$executeRaw`
              UPDATE outbox_events
              SET status = 'DELIVERED', delivered_at = NOW()
              WHERE id = ${row.id}
            `;

            this.logger.debug({
              msg: 'outbox.delivered',
              eventType: row.event_type,
              id: row.id,
            });
          } catch (err) {
            await tx.$executeRaw`
              UPDATE outbox_events SET status = 'FAILED' WHERE id = ${row.id}
            `;
            this.logger.error({
              msg: 'outbox.delivery_failed',
              eventType: row.event_type,
              id: row.id,
              err,
            });
          }
        }
      });
    } catch {
      // DB unavailable — swallow, retry next tick
    }
  }

  /**
   * Reconstruct the typed domain event and emit it.
   * This is the seam to swap for a real message broker:
   *   replace this.eventEmitter.emit(...) with producer.publish(...)
   */
  private dispatch(eventType: string, payload: Record<string, unknown>): void {
    switch (eventType) {
      case 'appointment.created':
        this.eventEmitter.emit(
          eventType,
          new AppointmentCreatedEvent(payload.appointment as any),
        );
        break;
      case 'appointment.cancelled':
        this.eventEmitter.emit(
          eventType,
          new AppointmentCancelledEvent(payload.appointment as any),
        );
        break;
      case 'appointment.status_changed':
        this.eventEmitter.emit(
          eventType,
          new AppointmentStatusChangedEvent(
            payload.appointment as any,
            payload.previousStatus as any,
          ),
        );
        break;
      default:
        this.logger.warn({ msg: 'outbox.unknown_event_type', eventType });
    }
  }
}
