import { Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';

export interface NextAvailableSlot {
  startTime: Date;
  endTime: Date;
}

const SLOT_STEP_MS = 30 * 60 * 1000;
const MAX_SEARCH_DAYS = 7;

function roundUpToSlot(date: Date): Date {
  const ms = date.getTime();
  const remainder = ms % SLOT_STEP_MS;
  return remainder === 0 ? new Date(ms) : new Date(ms + SLOT_STEP_MS - remainder);
}

function overlaps(s1: Date, e1: Date, s2: Date, e2: Date): boolean {
  return s1 < e2 && e1 > s2;
}

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * Find the earliest available slot where both a bay and a qualified technician
   * are free for the full service duration.
   *
   * Algorithm:
   * 1. Single query: fetch all future appointments for this dealership.
   * 2. Single query: fetch all bays and qualified technicians.
   * 3. Build in-memory occupation maps — O(m) where m = existing appointments.
   * 4. Candidate times = { from } ∪ { end of each existing appointment, rounded up }.
   *    This ensures we never miss a window that opens exactly when an existing job finishes.
   * 5. For each candidate (sorted), check all bay/tech pairs in O(m) — return first match.
   *
   * Total: 3 DB queries regardless of search horizon (vs O(n) queries in a naive slot-by-slot scan).
   */
  async findNextAvailable(
    dealershipId: string,
    serviceType: string,
    from: Date,
  ): Promise<NextAvailableSlot | null> {
    const durationMs = this.availabilityService.getServiceDuration(serviceType) * 60_000;
    const searchEnd = new Date(from.getTime() + MAX_SEARCH_DAYS * 24 * 60 * 60 * 1000);
    const normalizedServiceType = serviceType.toUpperCase();

    const [appointments, bays, technicians] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          dealershipId,
          status: { not: AppointmentStatus.CANCELLED },
          endTime: { gte: from },
          startTime: { lte: searchEnd },
        },
        select: { serviceBayId: true, technicianId: true, startTime: true, endTime: true },
      }),
      this.prisma.serviceBay.findMany({
        where: { dealershipId },
        select: { id: true },
      }),
      this.prisma.technician.findMany({
        where: {
          dealershipId,
          specializations: { has: normalizedServiceType },
        },
        select: { id: true },
      }),
    ]);

    if (bays.length === 0 || technicians.length === 0) return null;

    const bayIds = bays.map((b) => b.id);
    const techIds = technicians.map((t) => t.id);

    // Build occupation maps: resourceId → [(start, end)]
    const bayOccupied = new Map<string, Array<[Date, Date]>>();
    const techOccupied = new Map<string, Array<[Date, Date]>>();

    for (const apt of appointments) {
      if (!bayOccupied.has(apt.serviceBayId)) bayOccupied.set(apt.serviceBayId, []);
      bayOccupied.get(apt.serviceBayId)!.push([apt.startTime, apt.endTime]);

      if (!techOccupied.has(apt.technicianId)) techOccupied.set(apt.technicianId, []);
      techOccupied.get(apt.technicianId)!.push([apt.startTime, apt.endTime]);
    }

    // Candidates: start of search range + slot immediately after each appointment ends
    const candidateSet = new Set<number>([roundUpToSlot(from).getTime()]);
    for (const apt of appointments) {
      const slot = roundUpToSlot(apt.endTime).getTime();
      if (slot >= from.getTime() && slot < searchEnd.getTime()) {
        candidateSet.add(slot);
      }
    }

    for (const candidateMs of [...candidateSet].sort((a, b) => a - b)) {
      const start = new Date(candidateMs);
      const end = new Date(candidateMs + durationMs);
      if (end > searchEnd) break;

      for (const bayId of bayIds) {
        const bayBusy = (bayOccupied.get(bayId) ?? []).some(([s, e]) => overlaps(start, end, s, e));
        if (bayBusy) continue;

        for (const techId of techIds) {
          const techBusy = (techOccupied.get(techId) ?? []).some(([s, e]) => overlaps(start, end, s, e));
          if (!techBusy) return { startTime: start, endTime: end };
        }
      }
    }

    return null;
  }
}
