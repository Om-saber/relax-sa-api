# Setup

## 1. Requirements

- Node.js **22+**
- npm **10+**
- Docker + Docker Compose (recommended) **or** a PostgreSQL 16 instance
- `psql` client (for the extra constraints file)

## 2. Environment

```bash
cp .env.example .env
```

Generate real secrets:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 32   # OTP_PEPPER
```

Rules (enforced at startup when `NODE_ENV=production`, which the Dockerfile sets):
- `OTP_DEV_MODE` defaults to `false`, and `true` is rejected in production. `devCode` is never returned in production.
- `SMS_PROVIDER=console` is rejected in production. `taqnyat` needs `TAQNYAT_BEARER_TOKEN`, and `msegat` needs `MSEGAT_USERNAME` and `MSEGAT_API_KEY`.
- `SWAGGER_ENABLED` defaults to `false`, so set it to `true` explicitly to expose `/docs`.
- `SEED_ADMIN_PASSWORD` must not be `ChangeMe123!` in production. The seed script requires 12+ characters there.
- `CORS_ORIGINS` must list the exact frontend origins (no `*` with credentials).

## 3. Database

```bash
docker compose up -d postgres
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
```

**No Docker / no sudo?** Use the bundled throwaway cluster:

```bash
./scripts/local-db.sh start
# copy the printed DATABASE_URL into .env
./scripts/local-db.sh stop   # when done
```

Then apply constraints that Prisma cannot express (partial unique index for
double-booking, money checks):

```bash
psql "$DATABASE_URL" -f prisma/sql/01-extra-constraints.sql
psql "$DATABASE_URL" -f prisma/sql/02-booking-overlap.sql
```

Verify the index exists:

```sql
SELECT tgname FROM pg_trigger WHERE tgname = 'bookings_no_overlap_trigger';
```

## 4. Seed

```bash
npm run db:seed
```

The seed is idempotent (safe to re-run).

## 5. Run

```bash
npm run start:dev
```

| URL | Purpose |
|---|---|
| `http://localhost:3000/api/v1/health` | liveness + DB |
| `http://localhost:3000/docs` | Swagger |
| `http://localhost:3000/api/v1/auth/...` | auth endpoints |

## 6. Smoke test

```bash
# Ask for an OTP (dev mode returns devCode)
curl -s -X POST http://localhost:3000/api/v1/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"phone":"0501234567"}'

# Verify it
curl -s -X POST http://localhost:3000/api/v1/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"0501234567","code":"1234"}'

# Admin password login
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@relax.sa","password":"ChangeMe123!"}'
```

## 7. Docker (full stack)

```bash
cp .env.example .env
docker compose up --build
```

## 8. Migrations workflow

- Local: `npm run prisma:migrate -- --name <change>`
- Staging/production: `npm run prisma:deploy`
- Never edit an applied migration. Create a new one.
- After any migration that changes `bookings`, re-apply
  `prisma/sql/02-booking-overlap.sql` if the trigger was dropped.
