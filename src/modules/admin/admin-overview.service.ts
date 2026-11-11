import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalRevenue,
      todayRevenue,
      monthRevenue,
      bookingsByStatus,
      totalClients,
      newClientsThisMonth,
      totalStaff,
      availableStaff,
      onLeaveStaff,
      commissions,
      topServices,
    ] = await Promise.all([
      // Total revenue (from PAID payments)
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID },
        _sum: { amount: true },
      }),
      // Today revenue
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.PAID,
          paidAt: { gte: startOfDay },
        },
        _sum: { amount: true },
      }),
      // This month revenue
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.PAID,
          paidAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      // Bookings by status
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      // Clients
      this.prisma.user.count({
        where: { role: 'CUSTOMER', deletedAt: null },
      }),
      // New clients this month
      this.prisma.user.count({
        where: {
          role: 'CUSTOMER',
          deletedAt: null,
          createdAt: { gte: startOfMonth },
        },
      }),
      // Staff
      this.prisma.user.count({
        where: { role: 'STAFF', deletedAt: null, isActive: true },
      }),
      // Available staff
      this.prisma.staffProfile.count({
        where: { status: 'AVAILABLE' },
      }),
      // On leave staff
      this.prisma.staffProfile.count({
        where: { status: 'ON_LEAVE' },
      }),
      // Commissions
      this.prisma.booking.aggregate({
        where: {
          status: BookingStatus.COMPLETED,
          commissionAmount: { not: null },
        },
        _sum: { commissionAmount: true },
      }),
      // Top 5 services by booking count
      this.prisma.bookingItem.groupBy({
        by: ['serviceId'],
        _count: { _all: true },
        _sum: { quantity: true },
        orderBy: { _count: { serviceId: 'desc' } },
        take: 5,
      }),
    ]);

    // Build bookings stats from groupBy
    const bookingsStats = {
      total: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      pending: 0,
      confirmed: 0,
      onWay: 0,
      inProgress: 0,
    };

    for (const row of bookingsByStatus) {
      const count = row._count._all;
      bookingsStats.total += count;

      switch (row.status) {
        case BookingStatus.PENDING:
          bookingsStats.pending = count;
          bookingsStats.active += count;
          break;
        case BookingStatus.CONFIRMED:
          bookingsStats.confirmed = count;
          bookingsStats.active += count;
          break;
        case BookingStatus.ON_WAY:
          bookingsStats.onWay = count;
          bookingsStats.active += count;
          break;
        case BookingStatus.IN_PROGRESS:
          bookingsStats.inProgress = count;
          bookingsStats.active += count;
          break;
        case BookingStatus.COMPLETED:
          bookingsStats.completed = count;
          break;
        case BookingStatus.CANCELLED:
          bookingsStats.cancelled = count;
          break;
      }
    }

    // Enrich top services with titles
    const topServiceIds = topServices.map((s) => s.serviceId).filter(Boolean);
    const services = await this.prisma.service.findMany({
      where: { id: { in: topServiceIds as string[] } },
      select: { id: true, slug: true, titleAr: true, titleEn: true, imageUrl: true },
    });
    const serviceMap = new Map(services.map((s) => [s.id, s]));

    const enrichedTopServices = topServices
      .filter((s) => s.serviceId)
      .map((s) => {
        const svc = serviceMap.get(s.serviceId!);
        return {
          serviceId: s.serviceId,
          slug: svc?.slug || null,
          titleAr: svc?.titleAr || 'غير معروف',
          titleEn: svc?.titleEn || 'Unknown',
          imageUrl: svc?.imageUrl || null,
          bookingCount: s._count._all,
          quantity: s._sum.quantity || 0,
        };
      });

    const totalRevenueNum = Number(totalRevenue._sum.amount || 0);
    const completedBookings = bookingsStats.completed;

    // ── Capacity (per active city) ──────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const activeCities = await this.prisma.city.findMany({
      where: { isActive: true },
      select: {
        id: true, key: true, nameAr: true, nameEn: true,
        maxDailyCapacity: true, operatingHours: true,
      },
      orderBy: { nameAr: 'asc' },
    });

    const todayBookingsByCity = await this.prisma.booking.groupBy({
      by: ['cityId'],
      where: {
        deletedAt: null,
        date: { gte: todayStart, lt: tomorrowStart },
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
      },
      _count: { _all: true },
    });

    const todayCountMap = new Map(
      todayBookingsByCity.map((r) => [r.cityId, r._count._all]),
    );

    const capacity = activeCities.map((c) => ({
      cityId: c.id,
      cityKey: c.key,
      cityName: c.nameAr,
      cityNameEn: c.nameEn,
      bookingsToday: todayCountMap.get(c.id) ?? 0,
      maxDailyCapacity: c.maxDailyCapacity,
      operatingHours: c.operatingHours ?? '',
    }));

    return {
      revenue: {
        total: totalRevenueNum,
        today: Number(todayRevenue._sum.amount || 0),
        thisMonth: Number(monthRevenue._sum.amount || 0),
      },
      capacity,
      bookings: bookingsStats,
      clients: {
        total: totalClients,
        newThisMonth: newClientsThisMonth,
      },
      staff: {
        total: totalStaff,
        available: availableStaff,
        onLeave: onLeaveStaff,
      },
      commissions: {
        totalPaid: Number(commissions._sum.commissionAmount || 0),
      },
      avgBookingValue:
        completedBookings > 0
          ? Number((totalRevenueNum / completedBookings).toFixed(2))
          : 0,
      topServices: enrichedTopServices,
    };
  }
}
