import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { QueryAdminBookingsDto } from './dto/query-admin-bookings.dto';

const VALID_STATUSES = Object.values(BookingStatus);

@Injectable()
export class AdminBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryAdminBookingsDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = { deletedAt: null };

    if (query.cityKey) {
      where.city = { key: query.cityKey };
    }

    if (query.status) {
      const upper = query.status.toUpperCase();
      if (VALID_STATUSES.includes(upper as BookingStatus)) {
        where.status = upper as BookingStatus;
      }
    }

    if (query.search) {
      where.OR = [
        { bookingNumber: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { customerPhone: { contains: query.search } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: true,
          city: { select: { key: true, nameAr: true } },
          timeSlot: { select: { key: true, labelAr: true, startTime: true, endTime: true } },
        },
      }),
    ]);

    return {
      items: items.map((b) => this.serialize(b)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(id: string, status: string) {
    const upper = status.toUpperCase();
    if (!VALID_STATUSES.includes(upper as BookingStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `حالة غير صحيحة: ${status}`,
      });
    }

    const existing = await this.prisma.booking.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'الحجز غير موجود' });
    }

    const data: Prisma.BookingUpdateInput = { status: upper as BookingStatus };
    if (upper === 'CANCELLED' && existing.status !== 'CANCELLED') {
      data.cancelledAt = new Date();
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data,
      include: {
        items: true,
        city: { select: { key: true, nameAr: true } },
        timeSlot: { select: { key: true, labelAr: true } },
      },
    });

    return this.serialize(updated);
  }

  private serialize(b: any) {
    return {
      ...b,
      subtotal: Number(b.subtotal),
      discountAmount: Number(b.discountAmount),
      vatAmount: Number(b.vatAmount),
      totalPrice: Number(b.totalPrice),
      items: (b.items ?? []).map((i: any) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
      })),
    };
  }
}
