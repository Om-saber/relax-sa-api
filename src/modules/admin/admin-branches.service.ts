import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateBranchDto } from './dto/create-branch.dto';
import type { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class AdminBranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(cityId?: string) {
    const where: any = {};
    if (cityId) where.cityId = cityId;

    const branches = await this.prisma.branch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        city: { select: { id: true, nameAr: true, key: true } },
        _count: { select: { staff: true, bookings: true } },
      },
    });

    return branches.map((b) => ({
      ...b,
      staffCount: b._count?.staff ?? 0,
      bookingsCount: b._count?.bookings ?? 0,
    }));
  }

  async create(dto: CreateBranchDto) {
    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId },
      select: { id: true },
    });
    if (!city) {
      throw new BadRequestException({ code: 'CITY_NOT_FOUND', message: 'المدينة غير موجودة' });
    }

    const created = await this.prisma.branch.create({
      data: {
        cityId: dto.cityId,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn.trim(),
        managerName: dto.managerName?.trim() || null,
        phone: dto.phone?.trim() || null,
        isActive: dto.isActive ?? true,
      },
      include: { city: { select: { id: true, nameAr: true, key: true } } },
    });

    return { ...created, staffCount: 0, bookingsCount: 0 };
  }

  async update(id: string, dto: UpdateBranchDto) {
    const existing = await this.prisma.branch.findUnique({
      where: { id }, select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'الفرع غير موجود' });
    }

    if (dto.cityId) {
      const city = await this.prisma.city.findUnique({
        where: { id: dto.cityId }, select: { id: true },
      });
      if (!city) {
        throw new BadRequestException({ code: 'CITY_NOT_FOUND', message: 'المدينة غير موجودة' });
      }
    }

    const updated = await this.prisma.branch.update({
      where: { id },
      data: {
        ...(dto.cityId !== undefined ? { cityId: dto.cityId } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr.trim() } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
        ...(dto.managerName !== undefined ? { managerName: dto.managerName?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        city: { select: { id: true, nameAr: true, key: true } },
        _count: { select: { staff: true, bookings: true } },
      },
    });

    return {
      ...updated,
      staffCount: updated._count?.staff ?? 0,
      bookingsCount: updated._count?.bookings ?? 0,
    };
  }

  async toggle(id: string) {
    const existing = await this.prisma.branch.findUnique({
      where: { id }, select: { id: true, isActive: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'الفرع غير موجود' });
    }

    const updated = await this.prisma.branch.update({
      where: { id },
      data: { isActive: !existing.isActive },
      include: {
        city: { select: { id: true, nameAr: true, key: true } },
        _count: { select: { staff: true, bookings: true } },
      },
    });

    return {
      ...updated,
      staffCount: updated._count?.staff ?? 0,
      bookingsCount: updated._count?.bookings ?? 0,
    };
  }

  async remove(id: string) {
    const existing = await this.prisma.branch.findUnique({
      where: { id },
      select: { id: true, _count: { select: { bookings: true } } },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'الفرع غير موجود' });
    }

    if (existing._count.bookings > 0) {
      throw new BadRequestException({
        code: 'BRANCH_IN_USE',
        message: 'لا يمكن حذف فرع مرتبط بحجوزات. يمكنك تعطيله بدلاً من ذلك.',
      });
    }

    await this.prisma.branch.delete({ where: { id } });
    return { deleted: true, id };
  }
}
