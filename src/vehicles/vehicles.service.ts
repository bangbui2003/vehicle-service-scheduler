import { Injectable, NotFoundException } from '@nestjs/common';
import { Vehicle } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    return this.prisma.vehicle.create({ data: dto });
  }

  async findAll(customerId?: string): Promise<Vehicle[]> {
    return this.prisma.vehicle.findMany({
      where: customerId ? { customerId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException(`Vehicle ${id} not found`);
    return vehicle;
  }

  async remove(id: string): Promise<Vehicle> {
    await this.findOne(id);
    return this.prisma.vehicle.delete({ where: { id } });
  }
}
