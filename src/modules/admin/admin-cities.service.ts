import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateCityDto } from './dto/create-city.dto';
import type { UpdateCityDto } from './dto/update-city.dto';

const countsInclude = {
  _count: {
    select: { branches: true, coverageAreas: true, bookings: true, teams: true },
  },
} satisfies Prisma.CityInclude;

@Injectable()
export class AdminCitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const cities = await this.prisma.city.findMany({
      orderBy: { nameAr: 'asc' },
      include: countsInclude,
    });
    return cities.map((c) => this.serialize(c));
  }

  async create(dto: CreateCityDto) {
    const existing = await this.prisma.city.findUnique({
      where: { key: dto.key }, select: { id: true },
    });
    if (existing) {
      throw new ConflictException({ code: 'CITY_KEY_TAKEN', message: 'هذا الـ key مستخدم بالفعل' });
    }

    const created = await this.prisma.city.create({
      data: {
        key: dto.key,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        isActive: dto.isActive ?? true,
        deliveryFee: new Prisma.Decimal((dto.deliveryFee ?? 0).toFixed(2)),
        surgeMultiplier: new Prisma.Decimal((dto.surgeMultiplier ?? 1).toFixed(2)),
        operatingHours: dto.operatingHours,
        maxDailyCapacity: dto.maxDailyCapacity ?? 0,
      },
      include: countsInclude,
    });
    return this.serialize(created);
  }

  async update(id: string, dto: UpdateCityDto) {
    const existing = await this.prisma.city.findUnique({
      where: { id }, select: { id: true, key: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'المدينة غير موجودة' });
    }
    if (dto.key && dto.key !== existing.key) {
      const conflict = await this.prisma.city.findUnique({
        where: { key: dto.key }, select: { id: true },
      });
      if (conflict) {
        throw new ConflictException({ code: 'CITY_KEY_TAKEN', message: 'هذا الـ key مستخدم بالفعل' });
      }
    }

    const updated = await this.prisma.city.update({
      where: { id },
      data: {
        ...(dto.key !== undefined ? { key: dto.key } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.deliveryFee !== undefined
          ? { deliveryFee: new Prisma.Decimal(dto.deliveryFee.toFixed(2)) } : {}),
        ...(dto.surgeMultiplier !== undefined
          ? { surgeMultiplier: new Prisma.Decimal(dto.surgeMultiplier.toFixed(2)) } : {}),
        ...(dto.operatingHours !== undefined ? { operatingHours: dto.operatingHours } : {}),
        ...(dto.maxDailyCapacity !== undefined ? { maxDailyCapacity: dto.maxDailyCapacity } : {}),
      },
      include: countsInclude,
    });
    return this.serialize(updated);
  }

  async toggle(id: string) {
    const existing = await this.prisma.city.findUnique({
      where: { id }, select: { id: true, isActive: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'المدينة غير موجودة' });
    }
    const updated = await this.prisma.city.update({
      where: { id },
      data: { isActive: !existing.isActive },
      include: countsInclude,
    });
    return this.serialize(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.city.findUnique({
      where: { id },
      select: { id: true, _count: { select: { bookings: true } } },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'المدينة غير موجودة' });
    }
    if (existing._count.bookings > 0) {
      throw new BadRequestException({
        code: 'CITY_IN_USE',
        message: 'لا يمكن حذف مدينة مرتبطة بحجوزات. يمكنك تعطيلها بدلًا من ذلك.',
      });
    }
    await this.prisma.city.delete({ where: { id } });
    return { deleted: true, id };
  }

  private serialize(city: any) {
    return {
      ...city,
      deliveryFee: Number(city.deliveryFee),
      surgeMultiplier: Number(city.surgeMultiplier),
      branchesCount: city._count?.branches ?? 0,
      coverageAreasCount: city._count?.coverageAreas ?? 0,
      bookingsCount: city._count?.bookings ?? 0,
      teamsCount: city._count?.teams ?? 0,
    };
  }
}
