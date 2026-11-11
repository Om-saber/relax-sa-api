import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const staffUsers = await prisma.user.findMany({
    where: { role: 'STAFF', isActive: true },
    include: { staffProfile: true },
  });

  console.log(`Found ${staffUsers.length} STAFF users`);

  let counter = 1;
  for (const u of staffUsers) {
    if (u.staffProfile) {
      console.log(`  SKIP ${u.name} — already has profile`);
      continue;
    }

    // Generate unique staffCode
    let staffCode = `STF-${String(counter).padStart(3, '0')}`;
    while (await prisma.staffProfile.findUnique({ where: { staffCode } })) {
      counter++;
      staffCode = `STF-${String(counter).padStart(3, '0')}`;
    }

    const profile = await prisma.staffProfile.create({
      data: {
        userId: u.id,
        staffCode,
        roleTitle: 'أخصائية معتمدة',
        status: 'AVAILABLE',
        commissionRate: 20,
        rating: 5,
      },
    });

    console.log(`  ✓ ${u.name} → staffCode=${staffCode}, id=${profile.id}`);
    counter++;
  }

  console.log('\nFinal state:');
  const all = await prisma.staffProfile.findMany({
    include: { user: { select: { name: true, phone: true } } },
  });
  for (const p of all) {
    console.log(`  ${p.user.name} | ${p.staffCode} | ${p.status} | ${p.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
