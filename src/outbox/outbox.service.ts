import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class OutboxService {
  /**
   * Write a domain event into the outbox table.
   *
   * MUST be called inside a Prisma $transaction alongside the business write
   * (e.g. appointment INSERT). Both succeed or both fail atomically.
   *
   * Delivery to EventEmitter2 (or a future message broker) is handled
   * separately by OutboxWorker, which polls the table every 500 ms.
   */
  async publish(
    tx: Prisma.TransactionClient,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        eventType,
        payload: payload as any,
      },
    });
  }
}
