import { buildPackageLines, PricedPackage } from './booking-pricing';

const svc = (serviceId: string, price: number, quantity = 1, durationMinutes = 60) => ({
  serviceId,
  quantity,
  durationMinutes,
  service: { titleAr: serviceId, titleEn: null, price },
});

// Real seed data: "dalal-royal" is listed at 699 but its services list at 349 + 249 + 189 = 787.
const dalalRoyal: PricedPackage = {
  price: 699,
  items: [svc('massage', 349, 1, 90), svc('facial', 249, 1, 60), svc('feet', 189, 1, 45)],
};

const sum = (lines: ReturnType<typeof buildPackageLines>) =>
  lines.reduce((a, l) => a + Number(l.total), 0);

describe('buildPackageLines (P0-2 package pricing)', () => {
  it('charges the package price, not the sum of its services', () => {
    const lines = buildPackageLines(dalalRoyal, 1);
    expect(sum(lines)).toBeCloseTo(699, 2);
    expect(sum(lines)).not.toBeCloseTo(787, 2);
  });

  it('multiplies by the requested package quantity', () => {
    const lines = buildPackageLines(dalalRoyal, 2);
    expect(sum(lines)).toBeCloseTo(1398, 2);
    expect(lines.map((l) => l.quantity)).toEqual([2, 2, 2]);
  });

  it('keeps one line per service with its duration', () => {
    const lines = buildPackageLines(dalalRoyal, 1);
    expect(lines.map((l) => [l.serviceId, l.durationMinutes])).toEqual([
      ['massage', 90],
      ['facial', 60],
      ['feet', 45],
    ]);
  });

  it('splits proportionally and absorbs rounding so the total is exact', () => {
    const pkg: PricedPackage = { price: 100, items: [svc('a', 1), svc('b', 1), svc('c', 1)] };
    const lines = buildPackageLines(pkg, 1);
    expect(lines.map((l) => Number(l.total))).toEqual([33.33, 33.33, 33.34]);
    expect(sum(lines)).toBeCloseTo(100, 2);
  });

  it('splits evenly when all services are free', () => {
    const pkg: PricedPackage = { price: 50, items: [svc('a', 0), svc('b', 0)] };
    expect(buildPackageLines(pkg, 1).map((l) => Number(l.total))).toEqual([25, 25]);
  });

  it('accounts for item quantities inside the package', () => {
    const pkg: PricedPackage = { price: 300, items: [svc('a', 100, 2), svc('b', 100, 1)] };
    const lines = buildPackageLines(pkg, 1);
    expect(lines.map((l) => Number(l.total))).toEqual([200, 100]);
    expect(Number(lines[0].unitPrice)).toBe(100);
  });
});
