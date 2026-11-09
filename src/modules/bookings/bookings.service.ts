import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { QuerySlotsDto } from './dto/query-slots.dto';

// Statuses that "occupy" a slot (don't count cancelled/no-show)
const OCCUPYING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.ON_WAY,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
];

// Default max parallel bookings per slot (until per-slot capacity is added)
const DEFAULT_MAX_PER_SLOT = 10;

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────
  // GET /bookings/available-slots?date=YYYY-MM-DD&city=riyadh
  // ─────────────────────────────────────────────────────
  async getAvailableSlots(query: QuerySlotsDto) {
    const dateObj = this.parseDate(query.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateObj < today) {
      throw new BadRequestException({
        code: 'DATE_IN_PAST',
        message: 'لا يمكن الحجز في تاريخ ماضي',
      });
    }

    // ── 1) Resolve city (optional) ──
    let city = null;
    if (query.city) {
      city = await this.prisma.city.findUnique({
        where: { key: query.city },
        select: { id: true, key: true, nameAr: true, maxDailyCapacity: true },
      });
      if (!city) {
        throw new BadRequestException({
          code: 'CITY_NOT_FOUND',
          message: 'المدينة غير موجودة',
        });
      }
    }

    // ── 2) Blackout check ──
    let isBlackout = false;
    let blackoutReason: string | null = null;
    if (city) {
      const blackout = await this.prisma.blackoutDate.findFirst({
        where: { cityId: city.id, date: dateObj, active: true },
        select: { title: true },
      });
      if (blackout) {
        isBlackout = true;
        blackoutReason = blackout.title ?? 'غير متاح في هذا التاريخ';
      }
    }

    // ── 3) Get active time slots ──
    const slots = await this.prisma.timeSlot.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, key: true, labelAr: true, labelEn: true, startTime: true, endTime: true },
    });

    // ── 4) Count existing bookings per slot ──
    const existingBookings = await this.prisma.booking.groupBy({
      by: ['timeSlotId'],
      where: {
        date: dateObj,
        status: { in: OCCUPYING_STATUSES },
        deletedAt: null,
        ...(city ? { cityId: city.id } : {}),
        timeSlotId: { not: null },
      },
      _count: { _all: true },
    });

    const bookingsBySlot = new Map<string, number>();
    for (const row of existingBookings) {
      if (row.timeSlotId) {
        bookingsBySlot.set(row.timeSlotId, row._count._all);
      }
    }

    // ── 5) Daily capacity (city-wide) ──
    const totalDailyBooked = city
      ? await this.prisma.booking.count({
          where: {
            cityId: city.id,
            date: dateObj,
            status: { in: OCCUPYING_STATUSES },
            deletedAt: null,
          },
        })
      : 0;

    const dailyCapacity = city?.maxDailyCapacity ?? 0;
    const dailyFull = dailyCapacity > 0 && totalDailyBooked >= dailyCapacity;

    // ── 6) Build response ──
    return {
      date: query.date,
      city: city ? { key: city.key, nameAr: city.nameAr } : null,
      isBlackout,
      blackoutReason,
      dailyCapacity,
      dailyBooked: totalDailyBooked,
      dailyAvailable: dailyCapacity > 0 ? Math.max(0, dailyCapacity - totalDailyBooked) : null,
      dailyFull,
      slots: slots.map((slot) => {
        const booked = bookingsBySlot.get(slot.id) ?? 0;
        const remaining = Math.max(0, DEFAULT_MAX_PER_SLOT - booked);
        const available = !isBlackout && !dailyFull && remaining > 0;

        return {
          id: slot.id,
          key: slot.key,
          labelAr: slot.labelAr,
          labelEn: slot.labelEn,
          startTime: slot.startTime,
          endTime: slot.endTime,
          bookedCount: booked,
          remaining,
          available,
        };
      }),
    };
  }

  // ─────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────
  private parseDate(input: string): Date {
    const d = new Date(input + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'صيغة التاريخ غير صحيحة (YYYY-MM-DD)',
      });
    }
    return d;
  }
}
