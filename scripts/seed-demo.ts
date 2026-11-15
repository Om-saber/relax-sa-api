/**
 * Demo data seed — idempotent, safe to run repeatedly.
 *
 *   npx ts-node scripts/seed-demo.ts
 *
 * Creates (or refreshes) demo admin/staff/customer accounts and 6 bookings
 * numbered DEMO-0001..DEMO-0006 over the next 7 days. Relies on cities,
 * roles and services from prisma/seed.ts; it never modifies that seed.
 */
import { BookingStatus, PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo123!';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || DEMO_PASSWORD;

const ADMIN = { email: 'demo-admin@relax.sa', name: 'مدير تجريبي' };
const STAFF = [
  { email: 'demo-staff1@relax.sa', name: 'أخصائية تجريبية 1', code: 'DEMO-STF-1' },
  { email: 'demo-staff2@relax.sa', name: 'أخصائية تجريبية 2', code: 'DEMO-STF-2' },
];
const CUSTOMERS = [
  { phone: '0501234567', name: 'نورة', status: BookingStatus.PENDING },
  { phone: '0507654321', name: 'سارة', status: BookingStatus.CONFIRMED },
  { phone: '0509999999', name: 'منى', status: BookingStatus.COMPLETED },
];

const summary: string[] = [];
const log = (line: string) => {
  summary.push(line);
  console.log(line);
};

async function upsertByEmail(
  email: string,
  name: string,
  role: UserRole,
  password: string,
  roleId: string | null,
) {
  const passwordHash = await argon2.hash(password);
  const existed = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash, roleId, isActive: true, deletedAt: null },
    create: { email, name, role, passwordHash, roleId, isActive: true, emailVerifiedAt: new Date() },
  });
  log(`  ${existed ? '↻' : '✓'} ${role.padEnd(8)} ${email}`);
  return user;
}

async function main() {
  const riyadh = await prisma.city.findUnique({ where: { key: 'riyadh' } });
  if (!riyadh) {
    console.error('✗ City "riyadh" not found — run `npm run seed` first.');
    return;
  }
  const superAdminRole = await prisma.role.findUnique({ where: { key: 'super-admin' } });
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    take: 6,
  });
  if (services.length === 0) {
    console.error('✗ No active services found — run `npm run seed` first.');
    return;
  }

  console.log('Accounts:');
  await upsertByEmail(ADMIN.email, ADMIN.name, UserRole.ADMIN, ADMIN_PASSWORD, superAdminRole?.id ?? null);

  const staffProfiles = [];
  for (const s of STAFF) {
    const user = await upsertByEmail(s.email, s.name, UserRole.STAFF, DEMO_PASSWORD, null);
    const existingProfile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    const profile = existingProfile
      ? await prisma.staffProfile.update({
          where: { id: existingProfile.id },
          data: { cityId: riyadh.id, status: 'AVAILABLE' },
        })
      : await prisma.staffProfile.create({
          data: {
            userId: user.id,
            staffCode: s.code,
            roleTitle: 'أخصائية معتمدة',
            cityId: riyadh.id,
            status: 'AVAILABLE',
          },
        });
    staffProfiles.push(profile);
  }

  const clients = [];
  for (const c of CUSTOMERS) {
    const existed = await prisma.user.findUnique({ where: { phone: c.phone }, select: { id: true } });
    const user = await prisma.user.upsert({
      where: { phone: c.phone },
      update: { name: c.name, isActive: true, deletedAt: null },
      create: { phone: c.phone, name: c.name, role: UserRole.CUSTOMER, phoneVerifiedAt: new Date() },
    });
    const profile = await prisma.clientProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, cityId: riyadh.id, district: 'النرجس' },
    });
    clients.push({ ...c, user, profile });
    log(`  ${existed ? '↻' : '✓'} CUSTOMER ${c.phone} (${c.name}, OTP)`);
  }

  console.log('Bookings:');
  let n = 0;
  for (const client of clients) {
    for (let k = 0; k < 2; k++) {
      n++;
      const bookingNumber = `DEMO-${String(n).padStart(4, '0')}`;
      const existing = await prisma.booking.findUnique({ where: { bookingNumber }, select: { id: true } });
      if (existing) {
        log(`  ↻ ${bookingNumber} exists — skipped`);
        continue;
      }

      const service = services[(n - 1) % services.length];
      const startAt = new Date();
      startAt.setDate(startAt.getDate() + n); // days 1..6 ahead, within the next 7 days
      startAt.setHours(10 + k * 4, 0, 0, 0);
      const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
      const date = new Date(Date.UTC(startAt.getFullYear(), startAt.getMonth(), startAt.getDate()));
      const price = service.price;
      const specialist = client.status === BookingStatus.PENDING ? null : staffProfiles[k % staffProfiles.length];

      await prisma.booking.create({
        data: {
          bookingNumber,
          clientId: client.profile.id,
          customerName: client.name,
          customerPhone: client.phone,
          cityId: riyadh.id,
          district: 'النرجس',
          address: 'حي النرجس، الرياض',
          date,
          startAt,
          endAt,
          status: client.status,
          subtotal: price,
          totalPrice: price,
          paymentStatus: client.status === BookingStatus.COMPLETED ? 'PAID' : 'UNPAID',
          specialistId: specialist?.id ?? null,
          notes: 'حجز تجريبي',
          items: {
            create: {
              serviceId: service.id,
              titleAr: service.titleAr,
              titleEn: service.titleEn,
              unitPrice: price,
              quantity: 1,
              durationMinutes: service.durationMinutes,
              total: price,
            },
          },
          statusHistory: { create: { toStatus: client.status, note: 'demo seed' } },
        },
      });
      log(`  ✓ ${bookingNumber} ${client.status.padEnd(9)} ${client.name} — ${service.titleAr} @ ${startAt.toISOString()}`);
    }
  }

  console.log(`\nDone: ${summary.length} records processed (✓ created, ↻ existing).`);
  console.log(`Staff/admin password: ${process.env.SEED_ADMIN_PASSWORD ? '(admin from SEED_ADMIN_PASSWORD)' : DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('✗ Demo seed failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
