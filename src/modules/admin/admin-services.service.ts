import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateServiceDto } from './dto/create-service.dto';
import type { UpdateServiceDto } from './dto/update-service.dto';
import type { QueryAdminServicesDto } from './dto/query-admin-services.dto';

const serviceInclude = {
  category: { select: { id: true, key: true, nameAr: true, nameEn: true } },
} satisfies Prisma.ServiceInclude;

@Injectable()
export class AdminServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryAdminServicesDto) {
    const where: Prisma.ServiceWhereInput = {};

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.categoryKey) where.category = { key: query.categoryKey };
    if (query.isActive !== undefined) where.isActive = query.isActive;

    if (query.search) {
      where.OR = [
        { titleAr: { contains: query.search, mode: 'insensitive' } },
        { titleEn: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const services = await this.prisma.service.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        ...serviceInclude,
        _count: { select: { items: true, orderItems: true } },
      },
    });

    return services.map((s) => this.serialize(s));
  }

  async create(dto: CreateServiceDto) {
    // Validate category
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND', message: 'الفئة غير موجودة' });
    }

    // Check slug uniqueness
    const existing = await this.prisma.service.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({ code: 'SLUG_TAKEN', message: 'هذا الـ slug مستخدم بالفعل' });
    }

    const created = await this.prisma.service.create({
      data: {
        slug: dto.slug,
        titleAr: dto.titleAr,
        titleEn: dto.titleEn,
        descriptionAr: dto.descriptionAr,
        descriptionEn: dto.descriptionEn,
        categoryId: dto.categoryId,
        price: new Prisma.Decimal(dto.price.toFixed(2)),
        originalPrice: dto.originalPrice
          ? new Prisma.Decimal(dto.originalPrice.toFixed(2))
          : null,
        durationMinutes: dto.durationMinutes,
        maxBeneficiaries: dto.maxBeneficiaries ?? 1,
        badgeAr: dto.badgeAr,
        imageUrl: dto.imageUrl,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: serviceInclude,
    });

    return this.serialize(created);
  }

  async update(id: string, dto: UpdateServiceDto) {
    const existing = await this.prisma.service.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'SERVICE_NOT_FOUND', message: 'الخدمة غير موجودة' });
    }

    // Check slug uniqueness if changed
    if (dto.slug && dto.slug !== existing.slug) {
      const conflict = await this.prisma.service.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException({ code: 'SLUG_TAKEN', message: 'هذا الـ slug مستخدم بالفعل' });
      }
    }

    // Validate category if changed
    if (dto.categoryId) {
      const category = await this.prisma.serviceCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND', message: 'الفئة غير موجودة' });
      }
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr } : {}),
        ...(dto.titleEn !== undefined ? { titleEn: dto.titleEn } : {}),
        ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
        ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.price !== undefined
          ? { price: new Prisma.Decimal(dto.price.toFixed(2)) }
          : {}),
        ...(dto.originalPrice !== undefined
          ? {
              originalPrice: dto.originalPrice
                ? new Prisma.Decimal(dto.originalPrice.toFixed(2))
                : null,
            }
          : {}),
        ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
        ...(dto.maxBeneficiaries !== undefined ? { maxBeneficiaries: dto.maxBeneficiaries } : {}),
        ...(dto.badgeAr !== undefined ? { badgeAr: dto.badgeAr } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: serviceInclude,
    });

    return this.serialize(updated);
  }

  async toggle(id: string) {
    const existing = await this.prisma.service.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'SERVICE_NOT_FOUND', message: 'الخدمة غير موجودة' });
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data: { isActive: !existing.isActive },
      include: serviceInclude,
    });

    return this.serialize(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.service.findUnique({
      where: { id },
      select: { id: true, _count: { select: { items: true, orderItems: true } } },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'SERVICE_NOT_FOUND', message: 'الخدمة غير موجودة' });
    }

    // Prevent hard delete if used in bookings/orders
    if (existing._count.items > 0 || existing._count.orderItems > 0) {
      throw new BadRequestException({
        code: 'SERVICE_IN_USE',
        message: 'لا يمكن حذف خدمة مرتبطة بحجوزات أو طلبات. يمكنك تعطيلها بدلًا من ذلك.',
      });
    }

    await this.prisma.service.delete({ where: { id } });
    return { deleted: true, id };
  }

  private serialize(svc: any) {
    return {
      ...svc,
      price: Number(svc.price),
      originalPrice: svc.originalPrice ? Number(svc.originalPrice) : null,
      rating: Number(svc.rating),
      usageCount: svc._count?.items || 0,
    };
  }
}
