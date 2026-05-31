import { Injectable, NotFoundException } from '@nestjs/common';
import { ServiceBay } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceBayDto } from './dto/create-service-bay.dto';

@Injectable()
export class ServiceBaysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateServiceBayDto): Promise<ServiceBay> {
    return this.prisma.serviceBay.create({ data: dto });
  }

  async findAll(dealershipId?: string): Promise<ServiceBay[]> {
    return this.prisma.serviceBay.findMany({
      where: dealershipId ? { dealershipId } : undefined,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string): Promise<ServiceBay> {
    const bay = await this.prisma.serviceBay.findUnique({ where: { id } });
    if (!bay) throw new NotFoundException(`ServiceBay ${id} not found`);
    return bay;
  }

  async remove(id: string): Promise<ServiceBay> {
    await this.findOne(id);
    return this.prisma.serviceBay.delete({ where: { id } });
  }
}
