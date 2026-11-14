import { NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * يرجّع الحجز لو المستخدمة تملكه (عن طريق ملف العميلة أو رقم الجوال)، أو لو كانت ADMIN.
 * غير كده يرمي BOOKING_NOT_FOUND (مش 403) عشان مانكشفش وجود الحجز.
 *
 * مشترك بين BookingsService و PaymentsService عشان قاعدة الملكية تبقى واحدة.
 */
export async function findOwnedBookingOrThrow(
  prisma: Pick<PrismaService, 'user' | 'booking'>,
  id: string,
  userId: string,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { phone: true, role: true, clientProfile: { select: { id: true } } },
  });
  if (!user) {
    throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدمة غير موجودة' });
  }

  const where: Prisma.BookingWhereInput = { id, deletedAt: null };

  if (user.role !== UserRole.ADMIN) {
    const orConditions: Prisma.BookingWhereInput[] = [];
    if (user.clientProfile?.id) orConditions.push({ clientId: user.clientProfile.id });
    if (user.phone) orConditions.push({ customerPhone: user.phone });

    if (orConditions.length === 0) {
      throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'الحجز غير موجود' });
    }
    where.OR = orConditions;
  }

  const booking = await prisma.booking.findFirst({ where });
  if (!booking) {
    throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'الحجز غير موجود' });
  }
  return booking;
}
