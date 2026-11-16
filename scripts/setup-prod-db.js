#!/usr/bin/env node
/**
 * One-shot setup for a NEW, empty production database (Neon).
 *
 *   node scripts/setup-prod-db.js "<DIRECT connection string>"
 *
 * Runs, in order, against the URL you pass (never against .env):
 *   1. prisma migrate deploy
 *   2. prisma/sql/*.sql   (money constraints + double-booking trigger)
 *   3. prisma/seed.ts     (roles, cities, services, packages, admin…)
 *   4. scripts/seed-demo.ts (demo accounts, bookings, CMS, coupons…)
 *   5. a read-back check (tables, trigger, row counts)
 *
 * Why a script: the URL contains "&", which CMD/PowerShell treat as a command
 * separator. Here the URL is only ever passed through the environment of the
 * child processes, never on a command line, so no quoting problems.
 *
 * Safety:
 *   - refuses a "-pooler" URL (migrations need the direct connection)
 *   - refuses the same host as your local .env (protects your dev DB)
 *   - every step is idempotent, so re-running after a failure is safe
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function maskUrl(u) {
  return `${u.protocol}//${u.username}:****@${u.host}${u.pathname}`;
}

function localEnvHost() {
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    return m ? new URL(m[1]).hostname : null;
  } catch {
    return null;
  }
}

// Neon endpoints: ep-xxx.region.aws.neon.tech (direct) / ep-xxx-pooler.region… (pooled)
const baseEndpoint = (host) => host.replace('-pooler.', '.');

// ---------------------------------------------------------------- arguments
const raw = process.argv[2];
if (!raw) {
  die('Usage: node scripts/setup-prod-db.js "<DIRECT connection string from Neon>"');
}

let url;
try {
  url = new URL(raw);
} catch {
  die('That is not a valid connection string. Copy it from Neon → Connect → (Connection pooling OFF).');
}
if (!/^postgres(ql)?:$/.test(url.protocol)) die('The connection string must start with postgresql://');
if (url.hostname.includes('-pooler.')) {
  die(
    'This is the POOLED connection (host contains "-pooler").\n' +
      '  Migrations need the DIRECT one: in Neon → Connect, turn "Connection pooling" OFF and copy again.\n' +
      '  (Railway keeps using the pooled one — that is correct.)',
  );
}
const devHost = localEnvHost();
if (devHost && baseEndpoint(devHost) === baseEndpoint(url.hostname)) {
  die(
    `This is the SAME database as your local .env (${devHost}).\n` +
      '  Pass the connection string of the NEW production database (relax-sa-production).',
  );
}
if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '30');

// Child processes get the target DB via env only. Prisma never lets .env
// override a variable that is already set, so .env cannot leak in.
const childEnv = { ...process.env, DATABASE_URL: url.toString() };
if (!childEnv.SEED_ADMIN_PASSWORD) {
  console.warn(
    '⚠ SEED_ADMIN_PASSWORD is not set in this shell — the seeds will use the value from your local .env\n' +
      '  (or their built-in demo default). Set it first if production needs a different admin password.',
  );
}

// ---------------------------------------------------------------- runner
let stepNo = 0;
function step(title, command) {
  stepNo += 1;
  console.log(`\n━━━ ${stepNo}. ${title}\n$ ${command}`);
  // A single constant command string (no user input in it) — the URL is in env.
  const res = spawnSync(command, { cwd: ROOT, env: childEnv, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    die(`Step ${stepNo} failed (${title}). Fix the error above and re-run — every step is safe to repeat.`);
  }
}

console.log(`Target database: ${maskUrl(url)}`);

step('Apply migrations', 'npx prisma migrate deploy');

const sqlDir = path.join(ROOT, 'prisma', 'sql');
const sqlFiles = fs.existsSync(sqlDir) ? fs.readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort() : [];
for (const f of sqlFiles) {
  step(`Run SQL ${f}`, `npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/${f}`);
}

step('Seed base data (prisma/seed.ts)', 'npx tsx prisma/seed.ts');
step('Seed demo data (scripts/seed-demo.ts)', 'npx tsx scripts/seed-demo.ts');

// ---------------------------------------------------------------- verify
console.log(`\n━━━ ${stepNo + 1}. Verify`);
process.env.DATABASE_URL = childEnv.DATABASE_URL;
const { PrismaClient } = require(path.join(ROOT, 'node_modules', '@prisma/client'));
const prisma = new PrismaClient({ datasources: { db: { url: childEnv.DATABASE_URL } } });

(async () => {
  const [{ tables }] = await prisma.$queryRawUnsafe(
    "select count(*)::int as tables from information_schema.tables where table_schema = 'public'",
  );
  const triggers = await prisma.$queryRawUnsafe(
    "select tgname from pg_trigger where not tgisinternal and tgname = 'bookings_no_overlap_trigger'",
  );
  const counts = {
    users: await prisma.user.count(),
    cities: await prisma.city.count(),
    services: await prisma.service.count(),
    packages: await prisma.package.count(),
    bookings: await prisma.booking.count(),
    cmsPages: await prisma.cmsPage.count(),
  };
  await prisma.$disconnect();

  console.log(`  tables: ${tables}`);
  console.log(`  double-booking trigger: ${triggers.length ? 'installed ✓' : 'MISSING ✗'}`);
  console.log(`  rows: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  const pooledHost = url.hostname.replace(/^(ep-[^.]+)\./, '$1-pooler.');
  console.log('\n✓ Production database is ready.');
  console.log(`  Railway DATABASE_URL must use the POOLED host: ${pooledHost}`);
  if (!triggers.length || counts.users === 0) process.exitCode = 1;
})().catch((e) => {
  console.error('Verify step failed:', e.message);
  process.exit(1);
});
