import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      revenueSum,
      commissionsSum,
      totalBookings,
      completedBookings,
      cancelledBookings,
      activeBookings,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID },
        _sum: { amount: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          status: BookingStatus.COMPLETED,
          commissionAmount: { not: null },
        },
        _sum: { commissionAmount: true },
      }),
      this.prisma.booking.count({ where: { deletedAt: null } }),
      this.prisma.booking.count({
        where: { deletedAt: null, status: BookingStatus.COMPLETED },
      }),
      this.prisma.booking.count({
        where: { deletedAt: null, status: BookingStatus.CANCELLED },
      }),
      this.prisma.booking.count({
        where: {
          deletedAt: null,
          status: {
            in: [
              BookingStatus.PENDING,
              BookingStatus.CONFIRMED,
              BookingStatus.ON_WAY,
              BookingStatus.IN_PROGRESS,
            ],
          },
        },
      }),
    ]);

    const totalRevenue = Number(revenueSum._sum.amount || 0);
    const totalCommissions = Number(commissionsSum._sum.commissionAmount || 0);
    const completionRate =
      totalBookings > 0 ? Math.round((completedBookings / totalBookings) * 100) : 0;
    const cancellationRate =
      totalBookings > 0 ? Math.round((cancelledBookings / totalBookings) * 100) : 0;

    // Sales by city
    const bookingsByCity: any[] = await (this.prisma.booking.groupBy as any)({
      by: ['cityId'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const cityIds = bookingsByCity
      .map((b) => b.cityId)
      .filter((id): id is string => Boolean(id));
    const cities = cityIds.length
      ? await this.prisma.city.findMany({
          where: { id: { in: cityIds } },
          select: { id: true, nameAr: true },
        })
      : [];
    const cityMap = new Map(cities.map((c) => [c.id, c.nameAr]));

    const totalCityBookings = bookingsByCity.reduce((s: number, b: any) => s + b._count._all, 0);
    const salesByCity = bookingsByCity
      .map((b: any) => {
        const count = b._count._all;
        const percentage =
          totalCityBookings > 0 ? Math.round((count / totalCityBookings) * 100) : 0;
        return {
          cityId: b.cityId,
          cityName: b.cityId ? cityMap.get(b.cityId) || 'غير معروف' : 'غير محدد',
          count,
          percentage,
        };
      })
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 5);

    // Top services (by quantity sum)
    const itemsByServiceRaw: any[] = await (this.prisma.bookingItem.groupBy as any)({
      by: ['serviceId'],
      _sum: { quantity: true },
    });

    // Sort by sum desc + take top 5 (Prisma doesn't support orderBy on _sum)
    const itemsByService = itemsByServiceRaw
      .sort((a: any, b: any) => (b._sum?.quantity || 0) - (a._sum?.quantity || 0))
      .slice(0, 5);
    const serviceIds = itemsByService
      .map((s) => s.serviceId)
      .filter((id): id is string => Boolean(id));
    const services = serviceIds.length
      ? await this.prisma.service.findMany({
          where: { id: { in: serviceIds } },
          select: { id: true, titleAr: true },
        })
      : [];
    const serviceMap = new Map(services.map((s) => [s.id, s.titleAr]));

    const topServices = itemsByService
      .filter((s: any) => s.serviceId)
      .map((s: any) => ({
        serviceId: s.serviceId,
        titleAr: s.serviceId ? serviceMap.get(s.serviceId) || 'غير معروف' : 'غير معروف',
        count: s._sum.quantity || 0,
      }));

    return {
      kpis: {
        totalRevenue,
        totalCommissions,
        totalBookings,
        completedBookings,
        cancelledBookings,
        activeBookings,
        completionRate,
        cancellationRate,
      },
      salesByCity,
      topServices,
    };
  }
}
