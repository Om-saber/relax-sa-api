/**
 * Demo data seed — idempotent, safe to run repeatedly.
 *
 *   npx ts-node scripts/seed-demo.ts
 *
 * Creates (or refreshes) demo admin/staff/customer accounts and 6 bookings
 * numbered DEMO-0001..DEMO-0006 over the next 7 days. Relies on cities,
 * roles and services from prisma/seed.ts; it never modifies that seed.
 */
import { BookingStatus, Prisma, PrismaClient, UserRole } from '@prisma/client';
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

  await seedContent({ riyadhId: riyadh.id, services, staffProfiles, clients });

  console.log(`\nDone: ${summary.length} records processed (✓ created, ↻ existing).`);
  console.log(`Staff/admin password: ${process.env.SEED_ADMIN_PASSWORD ? '(admin from SEED_ADMIN_PASSWORD)' : DEMO_PASSWORD}`);
}

// ----------------------------- Demo content --------------------------------

const CONTACT = { phone: '920000000', email: 'support@relax.sa', whatsapp: '966500000000' };

const CMS_PAGES = [
  {
    slug: 'about',
    titleAr: 'من نحن',
    titleEn: 'About us',
    contentAr: [
      "Let's Relax منصة سعودية للعناية والاسترخاء مخصّصة للنساء فقط، تقدّم خدمات المساج والسبا والعناية بالبشرة على أيدي أخصائيات معتمدات في الرياض والخبر والدمام.",
      'نؤمن بأن لحظات الراحة حق لكل امرأة، لذلك نصمّم تجربة آمنة وخاصة تبدأ من الحجز الإلكتروني السهل وتنتهي بجلسة مريحة في منزلك أو في أحد فروعنا، مع الالتزام بأعلى معايير النظافة والخصوصية.',
    ].join('\n\n'),
  },
  {
    slug: 'privacy-policy',
    titleAr: 'سياسة الخصوصية',
    titleEn: 'Privacy policy',
    contentAr: [
      'نلتزم بحماية خصوصية بياناتك وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية.',
      'البيانات التي نجمعها: الاسم، رقم الجوال، العنوان، وتفاصيل الحجوزات والمدفوعات اللازمة لتقديم الخدمة.',
      'استخدام البيانات: لتأكيد الحجوزات والتواصل معك وتحسين خدماتنا، ولا نبيع بياناتك أو نشاركها مع أي طرف ثالث إلا مزوّدي الدفع والجهات الرسمية عند الطلب النظامي.',
      'حماية البيانات: تُحفظ بياناتك على خوادم آمنة مع تشفير الاتصالات، ولا نخزّن بيانات البطاقات البنكية لدينا.',
      'حقوقك: يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها بالتواصل معنا عبر ' + CONTACT.email + '.',
    ].join('\n\n'),
  },
  {
    slug: 'terms',
    titleAr: 'الشروط والأحكام',
    titleEn: 'Terms of service',
    contentAr: [
      "باستخدامك منصة Let's Relax فإنك توافقين على الشروط التالية.",
      'الخدمات مخصّصة للنساء فقط، ويجب أن يكون عمر صاحبة الحساب 18 عامًا فأكثر.',
      'تلتزم العميلة بتقديم معلومات صحيحة عن العنوان والحالة الصحية، وإبلاغ الأخصائية بأي موانع طبية قبل بدء الجلسة.',
      'الأسعار المعروضة شاملة ضريبة القيمة المضافة، وقد تُضاف رسوم توصيل حسب المدينة.',
      'يحق للمنصة رفض أو إلغاء أي حجز في حال مخالفة هذه الشروط أو وجود سلوك غير لائق تجاه الأخصائيات.',
      'تخضع هذه الشروط لأنظمة المملكة العربية السعودية.',
    ].join('\n\n'),
  },
  {
    slug: 'cancellation-policy',
    titleAr: 'سياسة الإلغاء والاسترداد',
    titleEn: 'Cancellation & refund policy',
    contentAr: [
      'الإلغاء قبل الموعد بـ 24 ساعة أو أكثر: استرداد كامل المبلغ.',
      'الإلغاء قبل الموعد بأقل من 24 ساعة: يُسترد 50% من المبلغ.',
      'عدم الحضور أو الإلغاء بعد وصول الأخصائية: لا يُسترد المبلغ.',
      'تغيير الموعد مجاني لمرة واحدة إذا تم قبل الموعد بـ 12 ساعة على الأقل.',
      'تُعاد المبالغ إلى وسيلة الدفع الأصلية خلال 5 إلى 14 يوم عمل حسب البنك.',
    ].join('\n\n'),
  },
  {
    slug: 'contact',
    titleAr: 'تواصل معنا',
    titleEn: 'Contact us',
    contentAr: [
      'يسعدنا تواصلك معنا طوال أيام الأسبوع من 9 صباحًا حتى 11 مساءً.',
      `الهاتف: ${CONTACT.phone}`,
      `البريد الإلكتروني: ${CONTACT.email}`,
      `واتساب: https://wa.me/${CONTACT.whatsapp}`,
    ].join('\n\n'),
  },
];

const FAQS = [
  ['booking', 'كيف أحجز؟', 'اختاري الخدمة من صفحة الخدمات، ثم حدّدي المدينة والموعد المناسب، وأكّدي الحجز بإدخال رقم جوالك ورمز التحقق.'],
  ['coverage', 'هل الخدمة متاحة في مدينتي؟', 'نخدم حاليًا الرياض والخبر والدمام، ونعمل على التوسّع لمدن أخرى قريبًا.'],
  ['payment', 'ما هي طرق الدفع؟', 'نقبل مدى وفيزا وماستركارد وApple Pay، بالإضافة إلى الدفع عند تقديم الخدمة في بعض الحالات.'],
  ['booking', 'هل يمكنني إلغاء الحجز؟', 'نعم، يمكنك الإلغاء من صفحة حجوزاتي. الإلغاء قبل 24 ساعة يسترد المبلغ كاملًا، وفق سياسة الإلغاء والاسترداد.'],
  ['staff', 'من هم الأخصائيون؟', 'جميع أخصائياتنا سيدات معتمدات وذوات خبرة، ويخضعن للتدريب والتحقق قبل الانضمام إلى الفريق.'],
  ['service', 'هل الخدمة منزلية؟', 'نعم، تصلك الأخصائية إلى منزلك مع كامل الأدوات، كما يمكنك زيارة أحد فروعنا.'],
  ['booking', 'ما هي سياسة التأخير؟', 'ننتظر حتى 15 دقيقة من بداية الموعد، وبعدها قد يتم تقليص مدة الجلسة أو اعتبار الحجز عدم حضور.'],
  ['booking', 'هل يمكن تغيير الموعد؟', 'نعم، تغيير الموعد مجاني لمرة واحدة إذا تم قبل الموعد بـ 12 ساعة على الأقل.'],
  ['support', 'كيف أتواصل مع الدعم؟', `عبر واتساب أو الاتصال على ${CONTACT.phone} أو البريد ${CONTACT.email}.`],
];

const BANNERS = [
  { key: 'home-banner-1', titleAr: 'عروض الشهر', contentAr: '/packages', imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1600&q=80' },
  { key: 'home-banner-2', titleAr: 'خدمات جديدة', contentAr: '/services', imageUrl: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=1600&q=80' },
  { key: 'home-banner-3', titleAr: 'خصم 20%', contentAr: '/services', imageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1600&q=80' },
];

const REVIEWS = [
  { rating: 5, comment: 'خدمة ممتازة والأخصائية محترفة جدًا' },
  { rating: 5, comment: 'تجربة رائعة، أنصح فيها بشدة' },
  { rating: 4, comment: 'الجلسة مريحة والوصول كان في الموعد' },
  { rating: 5, comment: 'نظافة وخصوصية عالية، شكرًا لكم' },
  { rating: 4, comment: 'جميلة جدًا، بس أتمنى توفّر مواعيد مسائية أكثر' },
  { rating: 5, comment: 'أفضل مساج جربته في الرياض' },
];

/** Returns false (and warns) when the generated Prisma client has no such model. */
function hasModel(name: string): boolean {
  if ((prisma as unknown as Record<string, unknown>)[name]) return true;
  console.warn(`  ⚠ model "${name}" not in schema — skipped`);
  return false;
}

async function seedContent(ctx: {
  riyadhId: string;
  services: Array<{ id: string; titleAr: string; titleEn: string; price: Prisma.Decimal; durationMinutes: number }>;
  staffProfiles: Array<{ id: string }>;
  clients: Array<{ name: string; phone: string; user: { id: string }; profile: { id: string } }>;
}) {
  console.log('CMS pages:');
  if (hasModel('cmsPage')) {
    for (const p of CMS_PAGES) {
      const existed = await prisma.cmsPage.findUnique({ where: { slug: p.slug }, select: { id: true } });
      await prisma.cmsPage.upsert({
        where: { slug: p.slug },
        update: { titleAr: p.titleAr, titleEn: p.titleEn, contentAr: p.contentAr, isPublished: true },
        create: { ...p, metaTitleAr: p.titleAr, isPublished: true },
      });
      log(`  ${existed ? '↻' : '✓'} /${p.slug} — ${p.titleAr}`);
    }
  }

  console.log('FAQs:');
  if (hasModel('faq')) {
    // Faq has no unique key besides id — match on the Arabic question.
    for (const [i, [category, questionAr, answerAr]] of FAQS.entries()) {
      const existing = await prisma.faq.findFirst({ where: { questionAr }, select: { id: true } });
      if (existing) {
        await prisma.faq.update({ where: { id: existing.id }, data: { category, answerAr, sortOrder: i, isActive: true } });
      } else {
        await prisma.faq.create({ data: { category, questionAr, answerAr, sortOrder: i, isActive: true } });
      }
      log(`  ${existing ? '↻' : '✓'} ${questionAr}`);
    }
  }

  console.log('Banners:');
  if ((prisma as unknown as Record<string, unknown>).banner) {
    console.warn('  ⚠ Banner model exists — update this script to use it');
  } else if (hasModel('cmsBlock')) {
    // No Banner model in the schema: banners live in CmsBlock (key home-banner-N,
    // contentAr = link target).
    for (const [i, b] of BANNERS.entries()) {
      const existed = await prisma.cmsBlock.findUnique({ where: { key: b.key }, select: { id: true } });
      await prisma.cmsBlock.upsert({
        where: { key: b.key },
        update: { titleAr: b.titleAr, contentAr: b.contentAr, imageUrl: b.imageUrl, sortOrder: i, isActive: true },
        create: { ...b, sortOrder: i, isActive: true },
      });
      log(`  ${existed ? '↻' : '✓'} ${b.key} — ${b.titleAr} → ${b.contentAr}`);
    }
  }

  console.log('Reviews:');
  if (hasModel('review')) {
    // Review is 1:1 with Booking, so each review gets its own past COMPLETED
    // booking (DEMO-R001..), spread across the demo customers.
    for (const [i, r] of REVIEWS.entries()) {
      const bookingNumber = `DEMO-R${String(i + 1).padStart(3, '0')}`;
      const client = ctx.clients[i % ctx.clients.length];
      const service = ctx.services[i % ctx.services.length];
      const staff = ctx.staffProfiles[i % ctx.staffProfiles.length];

      let booking = await prisma.booking.findUnique({ where: { bookingNumber }, select: { id: true } });
      if (!booking) {
        const startAt = new Date();
        startAt.setDate(startAt.getDate() - (i + 3));
        startAt.setHours(16, 0, 0, 0);
        booking = await prisma.booking.create({
          data: {
            bookingNumber,
            clientId: client.profile.id,
            customerName: client.name,
            customerPhone: client.phone,
            cityId: ctx.riyadhId,
            district: 'النرجس',
            date: new Date(Date.UTC(startAt.getFullYear(), startAt.getMonth(), startAt.getDate())),
            startAt,
            endAt: new Date(startAt.getTime() + service.durationMinutes * 60_000),
            status: BookingStatus.COMPLETED,
            subtotal: service.price,
            totalPrice: service.price,
            paymentStatus: 'PAID',
            specialistId: staff.id,
            notes: 'حجز تجريبي (تقييم)',
            items: {
              create: {
                serviceId: service.id,
                titleAr: service.titleAr,
                titleEn: service.titleEn,
                unitPrice: service.price,
                durationMinutes: service.durationMinutes,
                total: service.price,
              },
            },
            statusHistory: { create: { toStatus: BookingStatus.COMPLETED, note: 'demo seed' } },
          },
          select: { id: true },
        });
      }

      const existed = await prisma.review.findUnique({ where: { bookingId: booking.id }, select: { id: true } });
      await prisma.review.upsert({
        where: { bookingId: booking.id },
        update: { rating: r.rating, comment: r.comment, status: 'APPROVED' },
        create: {
          bookingId: booking.id,
          clientId: client.user.id,
          staffId: staff.id,
          rating: r.rating,
          comment: r.comment,
          status: 'APPROVED',
          publishedAt: new Date(),
        },
      });
      log(`  ${existed ? '↻' : '✓'} ${bookingNumber} ${'★'.repeat(r.rating)} ${client.name} — ${service.titleAr}`);
    }
  }
}

main()
  .catch((e) => {
    console.error('✗ Demo seed failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
