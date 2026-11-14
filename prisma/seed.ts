/**
 * Seed data for local development / staging.
 *
 * Idempotent: every write is an upsert, so it is safe to run repeatedly.
 * Source of truth for the catalog remains the frontend's src/data files until
 * the admin dashboard owns it. This seed covers a representative subset.
 */
import { PrismaClient, UserRole, DiscountType } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ key: string; label: string }> = [
  { key: 'viewBookings', label: 'عرض الحجوزات' },
  { key: 'editBookings', label: 'تعديل الحجوزات' },
  { key: 'cancelBookings', label: 'إلغاء الحجوزات' },
  { key: 'manageStaff', label: 'إدارة الموظفات' },
  { key: 'manageClients', label: 'إدارة العملاء' },
  { key: 'manageServices', label: 'إدارة الخدمات' },
  { key: 'manageCities', label: 'إدارة المدن والفروع' },
  { key: 'viewReports', label: 'عرض التقارير' },
  { key: 'manageRoles', label: 'إدارة الأدوار والصلاحيات' },
  { key: 'manageComplaints', label: 'إدارة الشكاوى' },
  { key: 'manageFinance', label: 'إدارة المالية' },
  { key: 'manageContent', label: 'إدارة المحتوى' },
];

const ROLES: Array<{ key: string; nameAr: string; nameEn: string; description: string; permissions: string[] }> = [
  {
    key: 'super-admin',
    nameAr: 'مدير النظام',
    nameEn: 'Super Admin',
    description: 'صلاحيات كاملة وغير مقيدة على كافة أقسام النظام.',
    permissions: PERMISSIONS.map((p) => p.key),
  },
  {
    key: 'management',
    nameAr: 'الإدارة العامة',
    nameEn: 'Management',
    description: 'متابعة العمليات اليومية والتقارير التشغيلية.',
    permissions: PERMISSIONS.map((p) => p.key).filter((k) => k !== 'manageRoles'),
  },
  {
    key: 'customer-service',
    nameAr: 'خدمة العملاء',
    nameEn: 'Customer Service',
    description: 'تأكيد الحجوزات والتواصل مع العميلات ومتابعة الشكاوى.',
    permissions: [
      'viewBookings',
      'editBookings',
      'cancelBookings',
      'manageClients',
      'manageComplaints',
    ],
  },
  {
    key: 'accountant',
    nameAr: 'المحاسب المالي',
    nameEn: 'Accountant',
    description: 'متابعة الإيرادات والمدفوعات والتقارير المالية.',
    permissions: ['viewBookings', 'viewReports', 'manageFinance'],
  },
  {
    key: 'supervisor',
    nameAr: 'المشرف الميداني',
    nameEn: 'Supervisor',
    description: 'متابعة حركة الموظفات وجودة الخدمة.',
    permissions: [
      'viewBookings',
      'editBookings',
      'manageStaff',
      'manageClients',
      'viewReports',
      'manageComplaints',
    ],
  },
  {
    key: 'branch-manager',
    nameAr: 'مدير الفرع',
    nameEn: 'Branch Manager',
    description: 'إدارة عمليات فرع معين وطاقمه.',
    permissions: [
      'viewBookings',
      'editBookings',
      'cancelBookings',
      'manageStaff',
      'manageClients',
      'manageCities',
      'viewReports',
      'manageComplaints',
    ],
  },
];

const CITIES = [
  { key: 'riyadh', nameAr: 'الرياض', nameEn: 'Riyadh', active: true, deliveryFee: 0, capacity: 40 },
  { key: 'khobar', nameAr: 'الخبر', nameEn: 'Khobar', active: true, deliveryFee: 25, capacity: 20 },
  { key: 'dammam', nameAr: 'الدمام', nameEn: 'Dammam', active: true, deliveryFee: 25, capacity: 15 },
  { key: 'jeddah', nameAr: 'جدة', nameEn: 'Jeddah', active: false, deliveryFee: 35, capacity: 25 },
];

const SLOTS = [
  { key: 'slot-1', labelAr: '10:00 صباحاً - 12:00 ظهراً', labelEn: '10:00 - 12:00', start: '10:00', end: '12:00', period: 'صباحي' },
  { key: 'slot-2', labelAr: '12:30 ظهراً - 02:30 ظهراً', labelEn: '12:30 - 14:30', start: '12:30', end: '14:30', period: 'ظهيرة' },
  { key: 'slot-3', labelAr: '03:00 عصراً - 05:00 مساءً', labelEn: '15:00 - 17:00', start: '15:00', end: '17:00', period: 'عصراً' },
  { key: 'slot-4', labelAr: '05:30 مساءً - 07:30 مساءً', labelEn: '17:30 - 19:30', start: '17:30', end: '19:30', period: 'مسائي' },
  { key: 'slot-5', labelAr: '08:00 مساءً - 10:00 مساءً', labelEn: '20:00 - 22:00', start: '20:00', end: '22:00', period: 'مسائي ذروة' },
  { key: 'slot-6', labelAr: '10:30 مساءً - 12:30 بعد منتصف الليل', labelEn: '22:30 - 00:30', start: '22:30', end: '00:30', period: 'سهرة هادئة' },
];

const CATEGORIES = [
  { key: 'packages', nameAr: 'باقات الدلال و VIP', nameEn: 'Packages', icon: 'Crown' },
  { key: 'massage', nameAr: 'المساج الفاخر', nameEn: 'Massage', icon: 'Heart' },
  { key: 'moroccan', nameAr: 'الحمام المغربي الملكي', nameEn: 'Moroccan Bath', icon: 'Droplets' },
  { key: 'beauty', nameAr: 'العناية والتجميل', nameEn: 'Beauty', icon: 'Flower2' },
  { key: 'maternity', nameAr: 'مساج الحوامل وبعد الولادة', nameEn: 'Maternity', icon: 'Baby' },
];

const SERVICES = [
  {
    slug: 'calm-package',
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80',
    category: 'packages',
    titleAr: 'باقة الهدوء',
    titleEn: 'Calm Package',
    price: 199,
    originalPrice: 450,
    durationMinutes: 90,
    badgeAr: 'الأكثر طلباً',
  },
  {
    slug: 'beauty-package',
    imageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80',
    category: 'packages',
    titleAr: 'باقة الجمال',
    titleEn: 'Beauty Package',
    price: 379,
    originalPrice: 450,
    durationMinutes: 120,
    badgeAr: 'باقة مميزة',
  },
  {
    slug: 'moroccan-royal',
    imageUrl: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=800&q=80',
    category: 'moroccan',
    titleAr: 'الحمام المغربي الملكي الفاخر',
    titleEn: 'Royal Moroccan Bath',
    price: 349,
    durationMinutes: 90,
  },
  {
    slug: 'swedish-massage',
    imageUrl: 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=800&q=80',
    category: 'massage',
    titleAr: 'المساج السويدي الاسترخائي',
    titleEn: 'Swedish Relaxing Massage',
    price: 249,
    durationMinutes: 60,
  },
  {
    slug: 'deep-tissue',
    imageUrl: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=800&q=80',
    category: 'massage',
    titleAr: 'مساج الأنسجة العميقة',
    titleEn: 'Deep Tissue Massage',
    price: 299,
    durationMinutes: 60,
  },
  {
    slug: 'pregnancy-massage',
    imageUrl: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=800&q=80',
    category: 'maternity',
    titleAr: 'مساج الحوامل',
    titleEn: 'Pregnancy Massage',
    price: 279,
    durationMinutes: 60,
  },
  {
    slug: 'facial-glow',
    imageUrl: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=800&q=80',
    category: 'beauty',
    titleAr: 'فيشل النضارة والكولاجين',
    titleEn: 'Collagen Glow Facial',
    price: 189,
    durationMinutes: 45,
  },
  {
    slug: 'hot-stones',
    imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80',
    category: 'massage',
    titleAr: 'مساج الأحجار البركانية',
    titleEn: 'Hot Stone Massage',
    price: 329,
    durationMinutes: 75,
  },
];

const ADDONS = [
  { nameAr: 'ماسك الذهب عيار 24 للوجه', nameEn: '24K Gold Face Mask', price: 65, duration: 15 },
  { nameAr: 'مساج أحجار بركانية إضافي للظهر', nameEn: 'Extra Hot Stones', price: 50, duration: 15 },
  { nameAr: 'مقشر الورد الفاسي للأقدام', nameEn: 'Rose Feet Scrub', price: 45, duration: 15 },
  { nameAr: 'زيت مسك ملكي خاص إضافي', nameEn: 'Royal Musk Oil', price: 35, duration: 0 },
];


// ---------------------------------------------------------------------------
// Packages (bundles of multiple services)
// ---------------------------------------------------------------------------
const PACKAGES = [
  {
    slug: 'dalal-royal',
    titleAr: 'باقة الدلال الملكية',
    titleEn: 'Royal Dalal Package',
    descriptionAr: 'تجربة دلال ملكية متكاملة: الحمام المغربي + المساج السويدي + فيشل النضارة',
    descriptionEn: 'Royal spa: Moroccan bath + Swedish massage + Collagen facial',
    imageUrl: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=800&q=80',
    price: 699,
    originalPrice: 749,
    durationMinutes: 195,
    services: [
      { slug: 'moroccan-royal', quantity: 1, durationMinutes: 90 },
      { slug: 'swedish-massage', quantity: 1, durationMinutes: 60 },
      { slug: 'facial-glow', quantity: 1, durationMinutes: 45 },
    ],
  },
  {
    slug: 'spa-day',
    titleAr: 'يوم السبا الكامل',
    titleEn: 'Full Spa Day',
    descriptionAr: 'يوم كامل من الاسترخاء: مساج سويدي + حمام مغربي + فيشل + أحجار بركانية',
    descriptionEn: 'Full relaxation day: Swedish + Moroccan + Facial + Hot stones',
    imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80',
    price: 999,
    originalPrice: 1166,
    durationMinutes: 270,
    services: [
      { slug: 'swedish-massage', quantity: 1, durationMinutes: 60 },
      { slug: 'moroccan-royal', quantity: 1, durationMinutes: 90 },
      { slug: 'facial-glow', quantity: 1, durationMinutes: 45 },
      { slug: 'hot-stones', quantity: 1, durationMinutes: 75 },
    ],
  },
  {
    slug: 'relax-escape',
    titleAr: 'هروب الاسترخاء',
    titleEn: 'Relax Escape',
    descriptionAr: 'جلسة سريعة لتجديد الطاقة: مساج سويدي + مساج أحجار بركانية',
    descriptionEn: 'Quick energy boost: Swedish massage + Hot stones',
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80',
    price: 499,
    originalPrice: 578,
    durationMinutes: 135,
    services: [
      { slug: 'swedish-massage', quantity: 1, durationMinutes: 60 },
      { slug: 'hot-stones', quantity: 1, durationMinutes: 75 },
    ],
  },
];

const isProduction = process.env.NODE_ENV === 'production';

async function main() {
  console.log('🌱 Seeding database...');

  // --- Permissions & roles -------------------------------------------------
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { label: permission.label },
      create: permission,
    });
  }

  for (const role of ROLES) {
    const created = await prisma.role.upsert({
      where: { key: role.key },
      update: {
        nameAr: role.nameAr,
        nameEn: role.nameEn,
        description: role.description,
        isSystem: true,
      },
      create: {
        key: role.key,
        nameAr: role.nameAr,
        nameEn: role.nameEn,
        description: role.description,
        isSystem: true,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: created.id } });
    for (const permissionKey of role.permissions) {
      const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
      if (!permission) continue;
      await prisma.rolePermission.create({
        data: { roleId: created.id, permissionId: permission.id },
      });
    }
  }

  // --- Admin user ----------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@relax.sa';
  // P0-4: في الإنتاج لازم كلمة سر حقيقية؛ القيمة الافتراضية للتطوير بس.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? (isProduction ? '' : 'ChangeMe123!');
  if (isProduction && (!adminPassword || adminPassword === 'ChangeMe123!' || adminPassword.length < 12)) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set to a strong value (12+ chars, not the default) when seeding in production',
    );
  }
  const superAdmin = await prisma.role.findUnique({ where: { key: 'super-admin' } });

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'مدير النظام',
      role: UserRole.ADMIN,
      roleId: superAdmin?.id,
      passwordHash: await argon2.hash(adminPassword),
      isActive: true,
    },
  });

  // --- Geography -----------------------------------------------------------
  const cityIds: Record<string, string> = {};
  for (const city of CITIES) {
    const created = await prisma.city.upsert({
      where: { key: city.key },
      update: {
        nameAr: city.nameAr,
        nameEn: city.nameEn,
        isActive: city.active,
        deliveryFee: city.deliveryFee,
        maxDailyCapacity: city.capacity,
        operatingHours: '10:00 ص - 01:00 ص',
      },
      create: {
        key: city.key,
        nameAr: city.nameAr,
        nameEn: city.nameEn,
        isActive: city.active,
        deliveryFee: city.deliveryFee,
        maxDailyCapacity: city.capacity,
        operatingHours: '10:00 ص - 01:00 ص',
      },
    });
    cityIds[city.key] = created.id;

    await prisma.branch.upsert({
      where: { id: `branch-${city.key}` },
      update: {},
      create: {
        id: `branch-${city.key}`,
        cityId: created.id,
        nameAr: `فرع ${city.nameAr}`,
        nameEn: `${city.nameEn} Branch`,
        isActive: city.active,
      },
    });

    for (const area of ['شمال', 'شرق', 'غرب', 'جنوب']) {
      await prisma.coverageArea.upsert({
        where: { id: `area-${city.key}-${area}` },
        update: {},
        create: {
          id: `area-${city.key}-${area}`,
          cityId: created.id,
          nameAr: `حي ${area} ${city.nameAr}`,
          nameEn: `${area} ${city.nameEn}`,
        },
      });
    }
  }

  // --- Time slots ----------------------------------------------------------
  for (const [index, slot] of SLOTS.entries()) {
    await prisma.timeSlot.upsert({
      where: { key: slot.key },
      update: { labelAr: slot.labelAr, labelEn: slot.labelEn, sortOrder: index },
      create: {
        key: slot.key,
        labelAr: slot.labelAr,
        labelEn: slot.labelEn,
        startTime: slot.start,
        endTime: slot.end,
        period: slot.period,
        sortOrder: index,
      },
    });
  }

  // --- Catalog -------------------------------------------------------------
  const categoryIds: Record<string, string> = {};
  for (const [index, category] of CATEGORIES.entries()) {
    const created = await prisma.serviceCategory.upsert({
      where: { key: category.key },
      update: {
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        icon: category.icon,
        sortOrder: index,
      },
      create: {
        key: category.key,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        icon: category.icon,
        sortOrder: index,
      },
    });
    categoryIds[category.key] = created.id;
  }

  const serviceIds: Record<string, string> = {};
  for (const [index, service] of SERVICES.entries()) {
    const created = await prisma.service.upsert({
      where: { slug: service.slug },
      update: {
        titleAr: service.titleAr,
        titleEn: service.titleEn,
        price: service.price,
        originalPrice: service.originalPrice,
        durationMinutes: service.durationMinutes,
        badgeAr: service.badgeAr,
        imageUrl: service.imageUrl,
        sortOrder: index,
      },
      create: {
        slug: service.slug,
        categoryId: categoryIds[service.category],
        titleAr: service.titleAr,
        titleEn: service.titleEn,
        price: service.price,
        originalPrice: service.originalPrice,
        durationMinutes: service.durationMinutes,
        badgeAr: service.badgeAr,
        imageUrl: service.imageUrl,
        sortOrder: index,
      },
    });
    serviceIds[service.slug] = created.id;
  }

  for (const addon of ADDONS) {
    await prisma.serviceAddon.upsert({
      where: { id: `addon-${addon.price}` },
      update: {},
      create: {
        id: `addon-${addon.price}`,
        nameAr: addon.nameAr,
        nameEn: addon.nameEn,
        price: addon.price,
        durationMinutes: addon.duration,
      },
    });
  }

  // --- Staff ---------------------------------------------------------------
  const staffSeed = [
    {
      code: 'st-01',
      name: 'فاطمة الزهراء البناني',
      email: 'fatima.bannani@relax.sa',
      phone: '0501112233',
      roleTitle: 'أخصائية أولى حمام مغربي ومساج',
      city: 'riyadh',
      commissionRate: 20,
      services: ['moroccan-royal', 'swedish-massage', 'facial-glow'],
    },
    {
      code: 'st-02',
      name: 'نورة بنت عبدالله العتيبي',
      email: 'noura.otaibi@relax.sa',
      phone: '0552223344',
      roleTitle: 'أخصائية مساج استرخائي وتأهيلي',
      city: 'riyadh',
      commissionRate: 20,
      services: ['swedish-massage', 'deep-tissue', 'hot-stones'],
    },
    {
      code: 'st-03',
      name: 'مريم الصالح',
      email: 'mariam.saleh@relax.sa',
      phone: '0533334455',
      roleTitle: 'أخصائية معتمدة مساج حوامل وعناية',
      city: 'khobar',
      commissionRate: 22,
      services: ['pregnancy-massage', 'facial-glow'],
    },
  ];

  const staffPassword = await argon2.hash('Staff123!');
  for (const staff of staffSeed) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: {},
      create: {
        email: staff.email,
        phone: staff.phone,
        name: staff.name,
        role: UserRole.STAFF,
        passwordHash: staffPassword,
        isActive: true,
      },
    });

    const profile = await prisma.staffProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        staffCode: staff.code,
        roleTitle: staff.roleTitle,
        cityId: cityIds[staff.city],
        commissionRate: staff.commissionRate,
        shiftStart: '10:00',
        shiftEnd: '20:00',
        isPartOfTeam: true,
      },
    });

    await prisma.staffBranch.upsert({
      where: { staffId_branchId: { staffId: profile.id, branchId: `branch-${staff.city}` } },
      update: {},
      create: { staffId: profile.id, branchId: `branch-${staff.city}` },
    });

    for (const slug of staff.services) {
      await prisma.staffService.upsert({
        where: { staffId_serviceId: { staffId: profile.id, serviceId: serviceIds[slug] } },
        update: {},
        create: { staffId: profile.id, serviceId: serviceIds[slug] },
      });
    }

    for (const weekday of [5, 6]) {
      await prisma.staffOffDay.upsert({
        where: { staffId_weekday: { staffId: profile.id, weekday } },
        update: {},
        create: { staffId: profile.id, weekday },
      });
    }
  }

  // --- Demo client ---------------------------------------------------------
  const client = await prisma.user.upsert({
    where: { phone: '0501234567' },
    update: {},
    create: {
      phone: '0501234567',
      name: 'سارة محمد القحطاني',
      role: UserRole.CUSTOMER,
      isActive: true,
    },
  });

  await prisma.clientProfile.upsert({
    where: { userId: client.id },
    update: {},
    create: {
      userId: client.id,
      tier: 'VIP',
      notes: 'تفضل أخصائية مغربية، التركيز على تخفيف آلام أسفل الظهر والرقبة.',
      district: 'حي الملقا',
      address: 'شارع أنس بن مالك، فيلا 14',
      cityId: cityIds.riyadh,
    },
  });

  // --- Coupons -------------------------------------------------------------
  for (const coupon of [
    { code: 'RELAX15', value: 15, minOrder: 150 },
    { code: 'SPA10', value: 10, minOrder: 100 },
  ]) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {},
      create: {
        code: coupon.code,
        type: DiscountType.PERCENTAGE,
        value: coupon.value,
        minOrder: coupon.minOrder,
        isActive: true,
      },
    });
  }

  // --- Settings ------------------------------------------------------------
  await prisma.setting.upsert({
    where: { key: 'booking.settings' },
    update: {},
    create: {
      key: 'booking.settings',
      value: {
        allowSpecialistSelection: false,
        specialistSelectionMode: 'auto',
        showStaffRatings: true,
        mandatoryTimeSelection: true,
        minAdvanceBookingHours: 2,
        maxAdvanceBookingDays: 30,
        requireTermsApproval: true,
        termsRequireExplicitCheckbox: true,
        travelBufferMinutes: 30,
        requireManualConfirmation: true,
        autoConfirmAfterMinutes: 120,
      },
    },
  });

  await prisma.setting.upsert({
    where: { key: 'cms.content' },
    update: {},
    create: {
      key: 'cms.content',
      value: {
        bannerAnnouncement:
          '✨ احجزي باقتك الفاخرة اليوم واحصلي على جلسة مساج مجانية للأقدام بكود: RELAX15 ✨',
        promoCode: 'RELAX15',
        promoDiscount: 15,
        supportPhone: '0537313756',
        workingHoursText:
          'نستقبلكم يومياً من الساعة 10:00 صباحاً وحتى 1:00 بعد منتصف الليل',
      },
    },
  });

  await prisma.setting.upsert({
    where: { key: 'finance.tax' },
    update: {},
    create: {
      key: 'finance.tax',
      value: { currency: 'SAR', vatRate: 15, pricesIncludeVat: true, zatcaEnabled: false },
    },
  });

  // --- Blackout dates ------------------------------------------------------
  await prisma.blackoutDate.upsert({
    where: { id: 'blk-01' },
    update: {},
    create: {
      id: 'blk-01',
      title: 'صيانة دورية للمعدات والأجهزة',
      date: new Date('2026-11-01'),
      cityId: cityIds.riyadh,
      active: true,
    },
  });

  // --- Packages ------------------------------------------------------------
  for (const pkg of PACKAGES) {
    const created = await prisma.package.upsert({
      where: { slug: pkg.slug },
      update: {
        titleAr: pkg.titleAr,
        titleEn: pkg.titleEn,
        descriptionAr: pkg.descriptionAr,
        descriptionEn: pkg.descriptionEn,
        imageUrl: pkg.imageUrl,
        price: pkg.price,
        originalPrice: pkg.originalPrice,
        durationMinutes: pkg.durationMinutes,
        isActive: true,
      },
      create: {
        slug: pkg.slug,
        titleAr: pkg.titleAr,
        titleEn: pkg.titleEn,
        descriptionAr: pkg.descriptionAr,
        descriptionEn: pkg.descriptionEn,
        imageUrl: pkg.imageUrl,
        price: pkg.price,
        originalPrice: pkg.originalPrice,
        durationMinutes: pkg.durationMinutes,
        isActive: true,
      },
    });

    await prisma.packageItem.deleteMany({ where: { packageId: created.id } });

    for (const item of pkg.services) {
      const svc = await prisma.service.findUnique({ where: { slug: item.slug } });
      if (!svc) continue;
      await prisma.packageItem.create({
        data: {
          packageId: created.id,
          serviceId: svc.id,
          quantity: item.quantity,
          durationMinutes: item.durationMinutes,
        },
      });
    }
  }
  console.log(`✅ Seeded ${PACKAGES.length} packages`);

  console.log('✅ Seed completed');
  console.log(`   Admin: ${adminEmail} / ${adminPassword}`);
  console.log('   Staff: *@relax.sa / Staff123!');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
