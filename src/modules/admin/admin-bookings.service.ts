import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
          specialist: {
            include: { user: { select: { name: true, phone: true } } },
          },
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
      specialistId: b.specialistId ?? null,
      specialistName: b.specialist?.user?.name ?? null,
      specialistPhone: b.specialist?.user?.phone ?? null,
      items: (b.items ?? []).map((i: any) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
      })),
    };
  }

  async assignSpecialist(bookingId: string, specialistId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, date: true, timeSlotId: true, startAt: true, endAt: true },
    });
    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: 'الحجز غير موجود',
      });
    }

    const specialist = await this.prisma.staffProfile.findUnique({
      where: { id: specialistId },
      select: { id: true, userId: true },
    });
    if (!specialist) {
      throw new NotFoundException({
        code: 'SPECIALIST_NOT_FOUND',
        message: 'الأخصائية غير موجودة',
      });
    }

    const conflict = await this.prisma.booking.findFirst({
      where: {
        specialistId,
        date: booking.date,
        timeSlotId: booking.timeSlotId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        id: { not: bookingId },
      },
      select: { id: true, bookingNumber: true },
    });
    if (conflict) {
      throw new ConflictException({
        code: 'DOUBLE_BOOKING',
        message: 'الأخصائية محجوزة في نفس الموعد',
        conflictBookingNumber: conflict.bookingNumber,
      });
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { specialistId },
      include: {
        specialist: { select: { id: true, user: { select: { name: true, phone: true } } } },
      },
    });

    return {
      id: updated.id,
      bookingNumber: updated.bookingNumber,
      specialistId: updated.specialistId,
      specialistName: updated.specialist?.user?.name ?? null,
    };
  }

}
