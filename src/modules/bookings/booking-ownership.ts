import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

export type NotOwnedBehaviour = 'not-found' | 'forbidden';

const bookingNotFound = () =>
  new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'الحجز غير موجود' });

const bookingForbidden = () =>
  new ForbiddenException({
    code: 'BOOKING_FORBIDDEN',
    message: 'غير مسموح لكِ بالوصول إلى هذا الحجز',
  });

/**
 * يرجّع الحجز لو المستخدمة تملكه (عن طريق ملف العميلة أو رقم الجوال)، أو لو كانت ADMIN.
 *
 * لو الحجز مش بتاعها:
 *  - 'not-found' (الافتراضي، مستخدم في BookingsService): 404 عشان مانكشفش وجود الحجز.
 *  - 'forbidden' (مستخدم في PaymentsService): 403 برسالة عربية، و404 لو الحجز مش موجود أصلاً.
 *
 * مشترك بين BookingsService و PaymentsService عشان قاعدة الملكية تبقى واحدة.
 */
export async function findOwnedBookingOrThrow(
  prisma: Pick<PrismaService, 'user' | 'booking'>,
  id: string,
  userId: string,
  onNotOwned: NotOwnedBehaviour = 'not-found',
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
    // مفيش شرط ملكية ممكن يطابق → نخلي الاستعلام مايرجعش حاجة.
    where.OR = orConditions.length ? orConditions : [{ id: { in: [] } }];
  }

  const booking = await prisma.booking.findFirst({ where });
  if (booking) return booking;

  if (onNotOwned === 'forbidden') {
    const exists = await prisma.booking.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (exists) throw bookingForbidden();
  }
  throw bookingNotFound();
}
