# Let's Relax — Backend API (`relax-api`)

Backend for **relax.sa** — a women-only luxury home spa platform (Riyadh / Khobar / Dammam).

This repository is intentionally **separate** from the frontend (`Relax.sa`).
The frontend stays deployed on Vercel untouched; this API is deployed independently.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22+ / TypeScript |
| Framework | NestJS 11 |
| Database | PostgreSQL 16 + Prisma |
| Auth | JWT access token (15m) + rotating refresh tokens |
| Validation | class-validator + zod (env) |
| Docs | OpenAPI / Swagger at `/docs` |
| Deploy | Docker (Railway / Render / VPS) |

## Quick start

```bash
cp .env.example .env

# 1. Start PostgreSQL (and Redis for later phases)
docker compose up -d postgres
# No Docker / no sudo? use the bundled local cluster instead:
# ./scripts/local-db.sh start   # prints the DATABASE_URL to use

# 2. Install dependencies
npm install

# 3. Create the schema + constraints
npm run prisma:migrate -- --name init
psql "$DATABASE_URL" -f prisma/sql/01-extra-constraints.sql

# 4. Seed reference data
npm run db:seed

# 5. Run
npm run start:dev
```

- API: <http://localhost:3000/api/v1>
- Swagger: <http://localhost:3000/docs>
- Health: <http://localhost:3000/api/v1/health>

### First login

| Role | Credentials |
|---|---|
| Admin | `admin@relax.sa` / `ChangeMe123!` |
| Staff | `fatima.bannani@relax.sa` / `Staff123!` |
| Client | phone `0501234567` + OTP (returned as `devCode` when `OTP_DEV_MODE=true`) |

> Change these credentials before any shared/staging environment.

## Project structure

```
src/
├── common/          # guards, filters, interceptors, decorators, types
├── config/          # env validation (zod)
├── modules/
│   ├── auth/        # OTP + password login, JWT, refresh rotation, SMS adapter
│   ├── users/       # profile endpoints
│   └── health/      # liveness + DB check
├── prisma/          # PrismaService (global)
└── main.ts
prisma/
├── schema.prisma    # full domain model
├── seed.ts          # idempotent seed
└── sql/             # constraints Prisma cannot express (partial unique index)
docs/
├── SETUP.md
├── ARCHITECTURE.md
├── ASSUMPTIONS.md
├── PREREQUISITES.md
├── API-CONTRACT.md
├── SECURITY.md
└── ERD.md
```

## Response envelope

Success:
```json
{ "success": true, "data": { }, "requestId": "…", "timestamp": "…" }
```

Error:
```json
{
  "success": false,
  "error": { "code": "OTP_INVALID", "message": "الرمز غير صحيح" },
  "requestId": "…",
  "timestamp": "…",
  "path": "/api/v1/auth/otp/verify"
}
```

## Roadmap

- [x] **Phase 0** — repo, schema, scaffold, Docker, docs
- [x] **Phase 1** — auth (OTP + password), RBAC, profile
- [ ] **Phase 2** — catalog, CMS, media, reviews
- [ ] **Phase 3** — booking core (availability, double-booking, state machine)
- [ ] **Phase 4** — payments, invoices, gift cards
- [ ] **Phase 5** — staff ops, commissions, CRM, notifications, reports
- [ ] **Phase 6** — hardening, tests, observability, launch
