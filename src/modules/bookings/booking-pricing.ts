import { Prisma } from '@prisma/client';

type Money = Prisma.Decimal | number | string;

export interface PricedPackage {
  price: Money;
  items: Array<{
    serviceId: string;
    quantity: number;
    durationMinutes: number;
    service: { titleAr: string; titleEn: string | null; price: Money };
  }>;
}

export interface BookingItemLine {
  serviceId: string;
  titleAr: string;
  titleEn: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  durationMinutes: number;
  total: Prisma.Decimal;
}

const toHalalas = (v: Money) => Math.round(Number(v) * 100);
const fromHalalas = (h: number) => new Prisma.Decimal((h / 100).toFixed(2));

/**
 * P0-2: a package is charged at Package.price (× quantity), not at the sum of
 * its services' list prices. The per-service lines are kept (duration/staff
 * need them) but the package total is split across them in proportion to each
 * service's list value, so the lines always add up to exactly price × quantity.
 * Rounding remainder goes to the last line; works in halalas to avoid float drift.
 */
export function buildPackageLines(pkg: PricedPackage, quantity: number): BookingItemLine[] {
  const packageTotal = toHalalas(pkg.price) * quantity;
  const weights = pkg.items.map((i) => toHalalas(i.service.price) * i.quantity);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  let allocated = 0;
  return pkg.items.map((item, idx) => {
    const isLast = idx === pkg.items.length - 1;
    const share = isLast
      ? packageTotal - allocated
      : weightSum > 0
        ? Math.round((packageTotal * weights[idx]) / weightSum)
        : Math.round(packageTotal / pkg.items.length);
    allocated += share;

    const lineQty = item.quantity * quantity;
    return {
      serviceId: item.serviceId,
      titleAr: item.service.titleAr,
      titleEn: item.service.titleEn,
      unitPrice: fromHalalas(Math.round(share / lineQty)),
      quantity: lineQty,
      durationMinutes: item.durationMinutes,
      total: fromHalalas(share),
    };
  });
}
