import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { QueryServicesDto } from './dto/query-services.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categories ──
  async listCategories() {
    return this.prisma.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        key: true,
        nameAr: true,
        nameEn: true,
        icon: true,
        sortOrder: true,
        _count: { select: { services: { where: { isActive: true } } } },
      },
    });
  }

  // ── Cities ──
  async listCities() {
    return this.prisma.city.findMany({
      where: { isActive: true },
      orderBy: { nameAr: 'asc' },
      select: {
        id: true,
        key: true,
        nameAr: true,
        nameEn: true,
        deliveryFee: true,
        operatingHours: true,
      },
    });
  }

  // ── Services ──
  async listServices(query: QueryServicesDto) {
    const where: any = { isActive: true };

    if (query.category) {
      where.category = { key: query.category };
    }

    if (query.search) {
      where.OR = [
        { titleAr: { contains: query.search, mode: 'insensitive' } },
        { titleEn: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const services = await this.prisma.service.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        category: { select: { key: true, nameAr: true, nameEn: true } },
        variants: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            labelAr: true,
            labelEn: true,
            durationMinutes: true,
            price: true,
            isDefault: true,
          },
        },
      },
    });

    // تطبيق سعر المدينة لو محدد
    if (query.city) {
      const city = await this.prisma.city.findUnique({
        where: { key: query.city },
        select: { id: true },
      });
      if (city) {
        const cityPrices = await this.prisma.serviceCityPrice.findMany({
          where: {
            cityId: city.id,
            serviceId: { in: services.map((s) => s.id) },
          },
          select: { serviceId: true, price: true },
        });
        const priceMap = new Map(cityPrices.map((p) => [p.serviceId, p.price]));
        return services.map((s) => ({
          ...s,
          price: priceMap.get(s.id) ?? s.price,
        }));
      }
    }

    return services;
  }

  async getServiceBySlug(slug: string) {
    const service = await this.prisma.service.findFirst({
      where: { slug, isActive: true },
      include: {
        category: { select: { key: true, nameAr: true, nameEn: true } },
        variants: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        addons: {
          where: { isActive: true },
          orderBy: { nameAr: 'asc' },
        },
      },
    });

    if (!service) {
      throw new NotFoundException({ code: 'SERVICE_NOT_FOUND', message: 'الخدمة غير موجودة' });
    }

    return service;
  }

  // ── Packages ──
  async listPackages() {
    return this.prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        items: {
          select: {
            quantity: true,
            durationMinutes: true,
            service: {
              select: { slug: true, titleAr: true, titleEn: true, imageUrl: true },
            },
          },
        },
      },
    });
  }

  async getPackageBySlug(slug: string) {
    const pkg = await this.prisma.package.findFirst({
      where: { slug, isActive: true },
      include: {
        items: {
          include: {
            service: {
              select: {
                slug: true,
                titleAr: true,
                titleEn: true,
                descriptionAr: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });

    if (!pkg) {
      throw new NotFoundException({ code: 'PACKAGE_NOT_FOUND', message: 'الباقة غير موجودة' });
    }

    return pkg;
  }
}
