import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientTier, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { QueryAdminClientsDto } from './dto/query-admin-clients.dto';

@Injectable()
export class AdminClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryAdminClientsDto) {
    const where: any = {
      role: UserRole.CUSTOMER,
      isActive: true,
    };

    if (query.search) {
      const digits = query.search.replace(/\D/g, '');
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
      ];
    }

    if (query.tier) {
      where.clientProfile = { tier: query.tier };
    } else {
      where.clientProfile = { isNot: null };
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      include: { clientProfile: true },
    });

    const cityIds = Array.from(
      new Set(
        users
          .map((u) => u.clientProfile?.cityId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const cities = cityIds.length
      ? await this.prisma.city.findMany({
          where: { id: { in: cityIds } },
          select: { id: true, nameAr: true, key: true },
        })
      : [];
    const cityMap = new Map(cities.map((c) => [c.id, c.nameAr]));

    const phones = users.map((u) => u.phone).filter((p): p is string => Boolean(p));
    const statsMap = await this.computeStatsByPhone(phones);

    return users.map((u) => this.serialize(u, cityMap, statsMap));
  }

  async getOne(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.CUSTOMER },
      include: { clientProfile: true },
    });
    if (!user || !user.clientProfile) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: 'العميلة غير موجودة',
      });
    }

    const [bookings, payments] = await Promise.all([
      user.phone
        ? this.prisma.booking.findMany({
            where: { customerPhone: user.phone },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { items: true, city: { select: { nameAr: true } } },
          })
        : Promise.resolve([]),

      user.phone
        ? this.prisma.payment.findMany({
            where: { booking: { customerPhone: user.phone } },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

    const cityMap = new Map<string, string>();
    if (user.clientProfile.cityId) {
      const city = await this.prisma.city.findUnique({
        where: { id: user.clientProfile.cityId },
        select: { nameAr: true },
      });
      if (city?.nameAr) cityMap.set(user.clientProfile.cityId, city.nameAr);
    }

    const statsMap = new Map<string, { count: number; spent: number }>();
    if (user.phone) {
      const bookingsArr = bookings as Array<{ totalPrice: unknown }>;
      statsMap.set(user.phone, {
        count: bookingsArr.length,
        spent: bookingsArr.reduce(
          (s: number, b: { totalPrice: unknown }) => s + Number(b.totalPrice || 0),
          0,
        ),
      });
    }

    return {
      ...this.serialize(user, cityMap, statsMap),
      bookings: bookings.map((b) => ({
        id: b.id,
        bookingNumber: b.bookingNumber,
        date: b.date,
        status: b.status,
        paymentStatus: b.paymentStatus,
        totalPrice: Number(b.totalPrice),
        city: b.city?.nameAr ?? null,
        itemsCount: b.items?.length ?? 0,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
    };
  }

  async addNote(userId: string, note: string) {
    const profile = await this.prisma.clientProfile.findFirst({
      where: { userId },
      select: { id: true, notes: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: 'العميلة غير موجودة',
      });
    }

    const ts = new Date().toLocaleString('ar-SA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const entry = `[${ts}] ${note.trim()}`;
    const updatedNotes = profile.notes ? `${entry}\n${profile.notes}` : entry;

    await this.prisma.clientProfile.update({
      where: { id: profile.id },
      data: { notes: updatedNotes },
    });

    return { success: true, notes: updatedNotes };
  }

  private async computeStatsByPhone(phones: string[]) {
    if (!phones.length) return new Map<string, { count: number; spent: number }>();
    const rows = await this.prisma.booking.groupBy({
      by: ['customerPhone'],
      where: { customerPhone: { in: phones } },
      _count: { _all: true },
      _sum: { totalPrice: true },
    });
    return new Map(
      rows.map((r) => [
        r.customerPhone,
        { count: r._count._all, spent: Number(r._sum.totalPrice || 0) },
      ]),
    );
  }

  private serialize(user: any, cityMap: Map<string, string>, statsMap?: Map<string, { count: number; spent: number }>) {
    const p = user.clientProfile;
    const stats = statsMap && user.phone ? statsMap.get(user.phone) : null;
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      isActive: user.isActive,
      tier: p?.tier ?? ClientTier.SILVER,
      notes: p?.notes ?? null,
      totalBookings: stats ? stats.count : (p?.totalBookings ?? 0),
      totalSpent: stats ? stats.spent : (p ? Number(p.totalSpent) : 0),
      lastBookingDate: p?.lastBookingDate ?? null,
      cityId: p?.cityId ?? null,
      city: p?.cityId ? cityMap.get(p.cityId) ?? null : null,
      district: p?.district ?? null,
      address: p?.address ?? null,
      createdAt: user.createdAt,
    };
  }
}
