# API contract

- Base URL: `/api/v1`
- Auth: `Authorization: Bearer <accessToken>`
- All responses use the envelope described in `README.md`.
- Pagination: `?page=1&limit=20` → `{ items, page, limit, total, totalPages }`
- Permission keys match the seeded `Permission.key` values.

## Phase 1 — Auth & profile (implemented)

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| POST | `/auth/otp/request` | public | — | 5 req/min. Returns `devCode` only when `OTP_DEV_MODE=true` |
| POST | `/auth/otp/verify` | public | — | Creates the client on first login |
| POST | `/auth/login` | public | — | Staff/Admin email + password |
| POST | `/auth/refresh` | public | — | Rotates the refresh token |
| POST | `/auth/logout` | bearer | — | Revokes one/all refresh tokens |
| POST | `/auth/logout-all` | bearer | — | Bumps `tokenVersion` |
| GET | `/auth/me` | bearer | — | Current user + permissions |
| GET | `/users/me` | bearer | — | Full profile |
| PATCH | `/users/me` | bearer | — | Name, email, district, address, cityId |
| GET | `/health` | public | — | DB probe |

### Error codes (Phase 1)

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_PHONE` | 400 | Not a Saudi mobile number |
| `OTP_TOO_FREQUENT` | 429 | Resend cooldown |
| `OTP_NOT_FOUND` | 400 | No active code |
| `OTP_EXPIRED` | 400 | Code expired |
| `OTP_ATTEMPTS_EXCEEDED` | 429 | Too many wrong attempts |
| `OTP_INVALID` | 401 | Wrong code |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `ACCOUNT_DISABLED` | 403 | `isActive=false` |
| `REFRESH_TOKEN_INVALID` | 401 | Revoked/expired/rotated |
| `EMAIL_TAKEN` | 409 | Profile email conflict |

## Phase 2 — Catalog, CMS, reviews

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/catalog/categories` | public | — |
| GET | `/catalog/services` | public | — (filters: `category`, `city`, `q`, paging) |
| GET | `/catalog/services/:slug` | public | — |
| GET | `/catalog/cities` | public | — |
| GET | `/catalog/slots` | public | — |
| GET | `/cms/blocks` | public | — |
| GET | `/cms/faqs` | public | — |
| GET | `/cms/gallery` | public | — |
| GET | `/reviews` | public | — (approved only) |
| POST | `/reviews` | bearer | client with a COMPLETED booking |
| POST | `/admin/catalog/services` | bearer | `manageServices` |
| PATCH | `/admin/catalog/services/:id` | bearer | `manageServices` |
| DELETE | `/admin/catalog/services/:id` | bearer | `manageServices` |
| PATCH | `/admin/cities/:id` | bearer | `manageCities` |
| POST | `/admin/media/presign` | bearer | `manageContent` |
| GET | `/admin/reviews?status=PENDING` | bearer | `manageContent` |
| PATCH | `/admin/reviews/:id/status` | bearer | `manageContent` |

## Phase 3 — Bookings

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/availability` | public | — (`cityId`, `date`, `serviceIds`) |
| POST | `/bookings` | public* | — (guest allowed) |
| GET | `/me/bookings` | bearer | — |
| PATCH | `/me/bookings/:id/reschedule` | bearer | — |
| POST | `/me/bookings/:id/cancel` | bearer | — |
| POST | `/coupons/validate` | public | — |
| GET | `/admin/bookings` | bearer | `viewBookings` |
| GET | `/admin/bookings/:id` | bearer | `viewBookings` |
| PATCH | `/admin/bookings/:id/status` | bearer | `editBookings` |
| PATCH | `/admin/bookings/:id/specialist` | bearer | `editBookings` |
| POST | `/admin/bookings` | bearer | `editBookings` |

\* Guests must verify their phone via OTP before the booking is accepted.

### Booking state transitions

| From | To | Who |
|---|---|---|
| `PENDING` | `CONFIRMED`, `CANCELLED` | admin / CS |
| `CONFIRMED` | `ON_WAY`, `CANCELLED` | staff / admin |
| `ON_WAY` | `IN_PROGRESS`, `CANCELLED` | staff |
| `IN_PROGRESS` | `COMPLETED`, `NO_SHOW` | staff |
| `PENDING`/`CONFIRMED` | `CANCELLED` | client (policy-dependent) |

`BOOKING_CONFLICT` (409) is returned when the specialist already has a live
booking in the same date + slot.

## Phase 4 — Payments, invoices, gift cards

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/payments/intent` | bearer/public | Creates a provider session |
| POST | `/payments/webhook/:provider` | signature | Idempotent; never trusts the body alone |
| POST | `/admin/payments/:id/refund` | `manageFinance` | Full/partial |
| GET | `/invoices/:bookingId` | owner / `manageFinance` | PDF URL |
| POST | `/gift-cards` | public | Purchase |
| POST | `/gift-cards/redeem` | bearer | Atomic balance decrement |
| GET | `/admin/gift-cards` | `manageFinance` | List |
| POST | `/admin/gift-cards/:id/void` | `manageFinance` | Void |

## Phase 5 — Ops, CRM, reports

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/staff/me/schedule` | bearer (staff) | — |
| PATCH | `/staff/me/status` | bearer (staff) | — |
| GET | `/admin/staff` | bearer | `manageStaff` |
| POST | `/admin/staff` | bearer | `manageStaff` |
| PATCH | `/admin/staff/:id` | bearer | `manageStaff` |
| GET | `/admin/clients` | bearer | `manageClients` |
| PATCH | `/admin/clients/:id` | bearer | `manageClients` |
| GET | `/admin/tickets` | bearer | `manageComplaints` |
| POST | `/tickets` | bearer/public | Client complaint |
| PATCH | `/admin/tickets/:id` | bearer | `manageComplaints` |
| GET | `/admin/commissions` | bearer | `manageFinance` |
| POST | `/admin/payouts` | bearer | `manageFinance` |
| GET | `/admin/reports/summary` | bearer | `viewReports` |
| GET | `/admin/reports/bookings` | bearer | `viewReports` |
| GET | `/admin/reports/revenue` | bearer | `viewReports` |
| GET | `/admin/settings` | bearer | `manageRoles` |
| PATCH | `/admin/settings` | bearer | `manageRoles` |
| PATCH | `/admin/roles/:id/permissions` | bearer | `manageRoles` |
