# Prerequisites & blockers

Status legend: ✅ ready · 🟡 in progress · ⛔ blocked · ⬜ not started

## Level 0 — needed to start

| Item | Owner | Lead time | Blocks | Status |
|---|---|---|---|---|
| Backend repository | Dev | — | everything | ✅ `Relax.sa-api` |
| Frontend repository access | Owner | 1 day | collaboration | ✅ local clone at `~/Documents/Relax.sa` |
| Stack approval (NestJS + Postgres) | Owner | — | all code | ✅ |
| VAT decision (inclusive/exclusive) | Owner / accountant | 1 day | invoice + schema | 🟡 assumed inclusive |
| Final price list | Owner | 1–3 days | catalog seed | ⬜ |
| Role matrix (who uses what) | Owner | 1–2 days | RBAC | 🟡 seeded from mock |
| Logo + brand assets | Owner | 1–2 days | invoices, emails | ⬜ |
| Legal company data (CR, VAT no., national address) | Owner | — | invoices, gateways | ⬜ |

## Level 1 — phase blockers

| Item | Owner | Lead time | Blocks | Workaround | Status |
|---|---|---|---|---|---|
| Domain `relax.sa` + DNS access | Owner | 1 day | CORS, callbacks, Apple Pay, email | staging domains | ⛔ unknown owner |
| SMS gateway account (Taqnyat/Msegat) | Owner | 1–5 days | real OTP | console provider | ⬜ |
| SMS sender name `Relax-Spa` approval | Owner | 1–3 days | branded OTP | default sender | ⬜ |
| Payment account (Moyasar/Tap) | Owner | 3–10 days | Phase 4 | sandbox + manual | ⬜ |
| Tabby merchant account | Owner | 2–4 weeks | BNPL | defer | ⬜ |
| Tamara merchant account | Owner | 2–4 weeks | BNPL | defer | ⬜ |
| Refund & cancellation policy | Owner | 1 day | booking rules | assumptions #6 | ⬜ |
| Privacy policy + terms | Owner | 1 week | booking checkbox | placeholder page | ⬜ |

## Level 2 — launch blockers

| Item | Owner | Lead time | Blocks | Workaround |
|---|---|---|---|---|
| WhatsApp Business API | Owner | 1–3 weeks | notifications | SMS + `wa.me` |
| Email domain + SPF/DKIM/DMARC | Owner | 1–3 days | invoices | console email |
| Monitoring (Sentry, uptime) | Dev | 1 day | observability | logs |
| Data migration file (Excel/export) | Owner | 2–5 days | launch data | seed only |
| PDPL / data-residency decision | Owner / legal | 1 week | hosting region | EU/US now |

## Level 3 — technical accounts (company-owned)

| Account | Purpose | Status |
|---|---|---|
| GitHub org/repo | source control | 🟡 personal repo exists |
| Railway / Render | API hosting | ⬜ |
| Neon / Supabase | managed PostgreSQL | ⬜ |
| Upstash | Redis (Phase 5) | ⬜ |
| Cloudflare R2 | media storage | ⬜ |
| Vercel | frontend (exists) | 🟡 check ownership |
| Resend / SES | transactional email | ⬜ |
| Sentry | error tracking | ⬜ |

## Security clean-up

| Item | Status |
|---|---|
| Rotate Firebase keys committed in `Relax.sa` history | ⬜ |
| Remove tracked `.env` from frontend repo | ⬜ |
| Delete unused `src/firebase` + `auth.service.js` | ⬜ |
| Confirm no billing on `supermarket-ce9ce` | ⬜ |

## Minimum start kit

1. Backend repo access ✅
2. Final price list
3. Role matrix
4. Logo + legal company data
5. Four booking rules confirmed:
   - automatic assignment?
   - human confirmation for every booking?
   - travel buffer?
   - cities active at launch?

Everything else can ship as configuration.
