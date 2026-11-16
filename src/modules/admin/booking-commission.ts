import { Prisma } from '@prisma/client';

type CommissionTx = Pick<Prisma.TransactionClient, 'staffProfile' | 'booking' | 'commission'>;

export interface CompletionCommission {
  rate: number;
  amount: number;
}

/** Commission = total × rate%, rounded to 2 decimals (halalas). */
export function computeCommission(totalPrice: Prisma.Decimal | number | string, rate: Prisma.Decimal | number | string): number {
  return Math.round(Number(totalPrice) * Number(rate)) / 100;
}

/**
 * Records the specialist's commission for a booking that has just become
 * COMPLETED. Shared by the staff-portal and the admin status routes so both
 * produce the same numbers.
 *
 * - Snapshots the specialist's current rate + amount on the booking.
 * - Upserts the Commission row (one per booking), so it is safe to call again.
 * - Returns null when the booking has no specialist (nothing to pay).
 *
 * Must be called inside the same transaction that sets status = COMPLETED.
 */
export async function applyCompletionCommission(
  tx: CommissionTx,
  booking: { id: string; totalPrice: Prisma.Decimal | number | string; specialistId: string | null },
): Promise<CompletionCommission | null> {
  if (!booking.specialistId) return null;

  const staff = await tx.staffProfile.findUnique({
    where: { id: booking.specialistId },
    select: { id: true, commissionRate: true },
  });
  if (!staff) return null;

  const rate = Number(staff.commissionRate);
  const amount = computeCommission(booking.totalPrice, rate);

  await tx.booking.update({
    where: { id: booking.id },
    data: { commissionRateSnapshot: rate, commissionAmount: amount },
  });

  await tx.commission.upsert({
    where: { bookingId: booking.id },
    update: { staffId: staff.id, rate, amount },
    create: { bookingId: booking.id, staffId: staff.id, rate, amount, status: 'PENDING' },
  });

  return { rate, amount };
}
