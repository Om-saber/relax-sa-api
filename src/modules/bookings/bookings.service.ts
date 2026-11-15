import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, BookingType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../notifications/telegram.service';
import { findOwnedBookingOrThrow } from './booking-ownership';
import type { QuerySlotsDto } from './dto/query-slots.dto';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { RescheduleBookingDto } from './dto/reschedule-booking.dto';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

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
  // POST /bookings — Create booking
  // ─────────────────────────────────────────────────────
  async create(dto: CreateBookingDto) {
    const dateObj = this.parseDate(dto.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateObj < today) {
      throw new BadRequestException({ code: 'DATE_IN_PAST', message: 'لا يمكن الحجز في تاريخ ماضي' });
    }

    const city = await this.prisma.city.findUnique({
      where: { key: dto.city },
      select: { id: true, key: true, maxDailyCapacity: true, isActive: true },
    });
    if (!city || !city.isActive) {
      throw new BadRequestException({ code: 'CITY_NOT_FOUND', message: 'المدينة غير متاحة' });
    }

    const blackout = await this.prisma.blackoutDate.findFirst({
      where: { cityId: city.id, date: dateObj, active: true },
      select: { title: true },
    });
    if (blackout) {
      throw new BadRequestException({
        code: 'BLACKOUT_DATE',
        message: `هذا التاريخ غير متاح للحجز: ${blackout.title}`,
      });
    }

    const dailyBooked = await this.prisma.booking.count({
      where: {
        cityId: city.id,
        date: dateObj,
        status: { in: OCCUPYING_STATUSES },
        deletedAt: null,
      },
    });
    if (city.maxDailyCapacity > 0 && dailyBooked >= city.maxDailyCapacity) {
      throw new BadRequestException({
        code: 'DAILY_CAPACITY_REACHED',
        message: 'تم الوصول للحد الأقصى من الحجوزات في هذا اليوم.',
      });
    }

    const slot = await this.prisma.timeSlot.findUnique({
      where: { key: dto.timeSlotKey },
      select: { id: true, key: true, startTime: true, endTime: true, isActive: true },
    });
    if (!slot || !slot.isActive) {
      throw new BadRequestException({ code: 'TIMESLOT_NOT_FOUND', message: 'الموعد غير متاح' });
    }

    const startAt = new Date(`${dto.date}T${slot.startTime}:00+03:00`);
    const endAt = new Date(`${dto.date}T${slot.endTime}:00+03:00`);
    if (endAt <= startAt) endAt.setUTCDate(endAt.getUTCDate() + 1);

    const serviceSlugs = dto.items.filter(i => i.serviceSlug).map((i) => i.serviceSlug!);
    const packageSlugs = dto.items.filter(i => i.packageSlug).map((i) => i.packageSlug!);

    const services = await this.prisma.service.findMany({
      where: { slug: { in: serviceSlugs }, isActive: true },
      select: { id: true, slug: true, titleAr: true, titleEn: true, price: true, durationMinutes: true },
    });
    const packages = await this.prisma.package.findMany({
      where: { slug: { in: packageSlugs }, isActive: true },
      include: { items: { include: { service: true } } }
    });

    if (services.length !== serviceSlugs.length) {
      const found = new Set(services.map((s) => s.slug));
      const missing = serviceSlugs.filter((s) => !found.has(s));
      throw new BadRequestException({
        code: 'SERVICES_NOT_FOUND',
        message: `خدمات غير موجودة: ${missing.join(', ')}`,
      });
    }
    if (packages.length !== packageSlugs.length) {
      const found = new Set(packages.map((p) => p.slug));
      const missing = packageSlugs.filter((s) => !found.has(s));
      throw new BadRequestException({
        code: 'PACKAGES_NOT_FOUND',
        message: `باقات غير موجودة: ${missing.join(', ')}`,
      });
    }
    
    const serviceMap = new Map(services.map((s) => [s.slug, s]));
    const packageMap = new Map(packages.map((p) => [p.slug, p]));

    let packageId = null;
    const itemsData: any[] = [];

    for (const item of dto.items) {
      if (item.serviceSlug) {
        const svc = serviceMap.get(item.serviceSlug)!;
        const lineTotal = Number(svc.price) * item.quantity;
        itemsData.push({
          serviceId: svc.id,
          titleAr: svc.titleAr,
          titleEn: svc.titleEn,
          unitPrice: svc.price,
          quantity: item.quantity,
          durationMinutes: svc.durationMinutes,
          total: new Prisma.Decimal(lineTotal.toFixed(2)),
        });
      } else if (item.packageSlug) {
        const pkg = packageMap.get(item.packageSlug)!;
        packageId = pkg.id;
        for (const pkgItem of pkg.items) {
          const lineTotal = Number(pkgItem.service.price) * pkgItem.quantity;
          itemsData.push({
            serviceId: pkgItem.serviceId,
            titleAr: pkgItem.service.titleAr,
            titleEn: pkgItem.service.titleEn,
            unitPrice: pkgItem.service.price,
            quantity: pkgItem.quantity,
            durationMinutes: pkgItem.durationMinutes,
            total: new Prisma.Decimal(lineTotal.toFixed(2)),
          });
        }
      }
    }
    const subtotal = itemsData.reduce((sum, i) => sum + Number(i.total), 0);
    const totalPrice = subtotal;
    const vatAmount = +(totalPrice - totalPrice / 1.15).toFixed(2);

    // Booking.clientId references ClientProfile.id (NOT User.id)
    const clientUser = await this.prisma.user.findFirst({
      where: { phone: dto.customerPhone, role: UserRole.CUSTOMER, deletedAt: null },
      select: { clientProfile: { select: { id: true } } },
    });
    const clientProfileId = clientUser?.clientProfile?.id ?? null;

    const year = dateObj.getUTCFullYear();
    try {
      const bookingResult = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking_num_${year}`}))`;

          const count = await tx.booking.count({
            where: { bookingNumber: { startsWith: `RLX-${year}-` } },
          });
          const bookingNumber = `RLX-${year}-${(count + 1).toString().padStart(4, '0')}`;

          const created = await tx.booking.create({
            data: {
              bookingNumber,
              clientId: clientProfileId,
              customerName: dto.customerName.trim(),
              customerPhone: dto.customerPhone,
              cityId: city.id,
              district: dto.district?.trim() ?? null,
              address: dto.address?.trim() ?? null,
              date: dateObj,
              timeSlotId: slot.id,
              startAt,
              endAt,
              bookingType: BookingType.INDIVIDUAL,
              packageId: packageId,
              beneficiariesCount: dto.beneficiariesCount ?? 1,
              status: BookingStatus.PENDING,
              subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
              discountAmount: new Prisma.Decimal('0.00'),
              vatAmount: new Prisma.Decimal(vatAmount.toFixed(2)),
              totalPrice: new Prisma.Decimal(totalPrice.toFixed(2)),
              paymentMethod: (dto.paymentMethod as any) ?? null,
              paymentStatus: 'UNPAID',
              notes: dto.notes?.trim() ?? null,
              items: { create: itemsData },
            },
            include: {
              items: true,
              timeSlot: { select: { key: true, labelAr: true, startTime: true, endTime: true } },
            },
          });

          return this.serializeBooking(created);
        },
        { timeout: 15000 },
      );

      // Send Telegram Notification
      try {
        const servicesList = (bookingResult.items || []).map((i: any) => `${i.titleAr} (x${i.quantity})`).join(' • ');
        const msg = `<b>🔔 حجز جديد!</b>\n\n` +
                    `<b>رقم الحجز:</b> ${bookingResult.bookingNumber}\n` +
                    `<b>العميلة:</b> ${bookingResult.customerName}\n` +
                    `<b>الجوال:</b> ${bookingResult.customerPhone}\n` +
                    `<b>الخدمات:</b> ${servicesList}\n` +
                    `<b>التاريخ:</b> ${dto.date}\n` +
                    `<b>الوقت:</b> ${bookingResult.timeSlot?.labelAr || dto.timeSlotKey}\n` +
                    `<b>الإجمالي:</b> ${bookingResult.totalPrice} ر.س\n`;
        
        this.telegramService.sendMessage(msg).catch((e) => console.error('Telegram error:', e));
      } catch (tgErr) {
        console.error('Failed to build Telegram message:', tgErr);
      }

      return bookingResult;
    } catch (err) {
      if (typeof err?.message === 'string' && err.message.includes('BOOKING_CONFLICT')) {
        throw new ConflictException({
          code: 'BOOKING_CONFLICT',
          message: 'هذا الموعد محجوز بالفعل. يرجى اختيار وقت آخر.',
        });
      }
      throw err;
    }
  }

  private serializeBooking(b: any) {
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

  // ─────────────────────────────────────────────────────
  // GET /bookings/me — Client's bookings
  // ─────────────────────────────────────────────────────
  async getMyBookings(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { phone: true, clientProfile: { select: { id: true } } },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدمة غير موجودة' });
    }

    const where: Prisma.BookingWhereInput = { deletedAt: null };
    const orConditions: Prisma.BookingWhereInput[] = [];
    if (user.clientProfile?.id) orConditions.push({ clientId: user.clientProfile.id });
    if (user.phone) orConditions.push({ customerPhone: user.phone });

    if (orConditions.length === 0) return [];
    where.OR = orConditions;

    return this.prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        timeSlot: { select: { key: true, labelAr: true, startTime: true, endTime: true } },
        city: { select: { key: true, nameAr: true } },
      },
    });
  }

  // ─────────────────────────────────────────────────────
  // GET /bookings/:id — Single booking (ownership check)
  // ─────────────────────────────────────────────────────
  async getBookingById(id: string, userId: string) {
    const booking = await this.findOwnedBooking(id, userId);
    return this.prisma.booking.findUnique({
      where: { id: booking.id },
      include: {
        items: true,
        timeSlot: { select: { key: true, labelAr: true, startTime: true, endTime: true } },
        city: { select: { key: true, nameAr: true } },
      },
    });
  }

  // ─────────────────────────────────────────────────────
  // PATCH /bookings/:id/cancel — Cancel booking
  // ─────────────────────────────────────────────────────
  async cancelBooking(id: string, reason: string | undefined, userId: string) {
    const booking = await this.findOwnedBooking(id, userId);

    const cancellableStatuses: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestException({
        code: 'CANNOT_CANCEL',
        message: 'لا يمكن إلغاء الحجز في حالته الحالية',
      });
    }

    return this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason?.trim() || null,
      },
      include: {
        items: true,
        timeSlot: { select: { key: true, labelAr: true } },
      },
    });
  }

  // ─────────────────────────────────────────────────────
  // PATCH /bookings/:id/reschedule — Reschedule booking
  // ─────────────────────────────────────────────────────
  async rescheduleBooking(id: string, dto: RescheduleBookingDto, userId: string) {
    const booking = await this.findOwnedBooking(id, userId);

    const reschedulableStatuses: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
    if (!reschedulableStatuses.includes(booking.status)) {
      throw new BadRequestException({
        code: 'CANNOT_RESCHEDULE',
        message: 'لا يمكن إعادة جدولة الحجز في حالته الحالية',
      });
    }

    const dateObj = this.parseDate(dto.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateObj < today) {
      throw new BadRequestException({ code: 'DATE_IN_PAST', message: 'لا يمكن الحجز في تاريخ ماضي' });
    }

    const slot = await this.prisma.timeSlot.findUnique({
      where: { key: dto.timeSlotKey },
      select: { id: true, startTime: true, endTime: true, isActive: true },
    });
    if (!slot || !slot.isActive) {
      throw new BadRequestException({ code: 'TIMESLOT_NOT_FOUND', message: 'الموعد غير متاح' });
    }

    const startAt = new Date(`${dto.date}T${slot.startTime}:00+03:00`);
    const endAt = new Date(`${dto.date}T${slot.endTime}:00+03:00`);
    if (endAt <= startAt) endAt.setUTCDate(endAt.getUTCDate() + 1);

    return this.prisma.booking.update({
      where: { id },
      data: {
        date: dateObj,
        timeSlotId: slot.id,
        startAt,
        endAt,
        status: BookingStatus.PENDING,
      },
      include: {
        items: true,
        timeSlot: { select: { key: true, labelAr: true, startTime: true, endTime: true } },
      },
    });
  }

  // ─────────────────────────────────────────────────────
  // Helper: find owned booking (admin can access any)
  // ─────────────────────────────────────────────────────
  private findOwnedBooking(id: string, userId: string) {
    return findOwnedBookingOrThrow(this.prisma, id, userId);
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
