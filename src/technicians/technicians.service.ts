import { Injectable, NotFoundException } from '@nestjs/common';
import { Technician } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTechnicianDto } from './dto/create-technician.dto';

@Injectable()
export class TechniciansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTechnicianDto): Promise<Technician> {
    return this.prisma.technician.create({
      data: {
        ...dto,
        specializations: dto.specializations.map((s) => s.toUpperCase()),
      },
    });
  }

  async findAll(dealershipId?: string): Promise<Technician[]> {
    return this.prisma.technician.findMany({
      where: dealershipId ? { dealershipId } : undefined,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string): Promise<Technician> {
    const tech = await this.prisma.technician.findUnique({ where: { id } });
    if (!tech) throw new NotFoundException(`Technician ${id} not found`);
    return tech;
  }

  async remove(id: string): Promise<Technician> {
    await this.findOne(id);
    return this.prisma.technician.delete({ where: { id } });
  }
}
