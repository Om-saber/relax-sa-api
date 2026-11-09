# Architecture

## Layers

```
HTTP → Controller → Service → Prisma → PostgreSQL
                 ↘ Guard (JWT + permissions)
                 ↘ Pipe (validation)
                 ↘ Filter (error envelope)
                 ↘ Interceptor (success envelope)
```

- **Controllers** never contain business rules.
- **Services** own business rules and transactions.
- **Prisma** is the only DB access layer.
- Money, VAT, commissions, and availability are **never** trusted from the client.

## Modules (current)

| Module | Responsibility |
|---|---|
| `auth` | OTP request/verify, password login, token issue/refresh/revoke, SMS adapter |
| `users` | profile read/update |
| `health` | liveness + DB probe |

## Planned modules

| Module | Phase |
|---|---|
| `addresses` (multi-address + geo) | 2 |
| `catalog` (services, variants, packages, categories, addons, cities, slots) | 2 |
| `cms` (pages, blocks, faq, gallery, contact) | 2 |
| `reviews` | 2 |
| `bookings` (availability, teams, conflicts, state machine) | 3 |
| `orders` (financial container, payment links) | 4 |
| `payments` (Moyasar/Tabby/Tamara, webhooks) | 4 |
| `gift-cards` | 4 |
| `loyalty` + `wallet` + `promotions` + `favorites` | 5 |
| `staff` (shifts, leaves, blocked times, commissions, payouts) | 6 |
| `clients` (CRM) | 6 |
| `tickets` | 6 |
| `reports` | 6 |
| `notifications` (SMS/WhatsApp/Email) | 7 |
| `settings` + `feature flags` | 6 |

## Key decisions

1. **Relational DB (PostgreSQL).** Bookings, money, commissions, and reporting
   are relational. Firestore was rejected for this domain.
2. **Single organisation, multi-city.** Every business row carries `cityId`;
   there is no multi-tenant isolation.
3. **Money as `Decimal(10,2)` in SAR, VAT-inclusive.** VAT is derived on the
   invoice (`vatAmount = total * 15 / 115` when `pricesIncludeVat = true`).
4. **Time-range booking.** A booking occupies a real `[startAt, endAt)` window
   derived from the chosen `ServiceVariant` duration. Conflicts are enforced by
   the `enforce_booking_no_overlap` trigger (staff **and** team), with advisory
   locks to close the check-then-insert race. The legacy six `TimeSlot` rows are
   kept as display suggestions only. A configurable travel buffer is enforced
   in the availability service (Phase 3).
5. **Booking vs Order.** `Booking` is the scheduled event (when / where / who).
   `Order` is the financial container (items / discounts / payments). One order
   can group several bookings, which is what makes partial payments, payment
   links, and rescheduling safe. Booking keeps a money snapshot for history.
6. **Group bookings are parallel.** N beneficiaries = N simultaneous sessions
   on a team of N specialists; price = session price × N. Availability is
   computed per team, not per person.
7. **Auth.** Clients: phone + OTP **and** optional password with reset flow.
   Staff/Admin: email + password (Argon2), optional TOTP later.
8. **Token strategy.** Short-lived access token + rotating refresh token stored
   hashed in the DB. `tokenVersion` allows instant global revocation.
9. **Provider abstraction.** SMS, payments, and WhatsApp are interfaces so the
   vendor can change without touching domain code.
10. **Config over code.** Prices, policies, capacities, commissions, and content
    live in the DB (`settings`, catalog tables), not in the source.

## Booking state machine (Phase 3)

```
PENDING ──confirm──▶ CONFIRMED ──▶ ON_WAY ──▶ IN_PROGRESS ──▶ COMPLETED
   │                     │             │            │
   └──cancel─────────────┴─────────────┴────────────┴──▶ CANCELLED
                                                    └──▶ NO_SHOW
```

Transitions are validated server-side and recorded in
`booking_status_history`.

## Money rules

- **Order is the source of truth for money.** `Order.subtotal` = sum of
  `order_items.total`. A booking mirrors the relevant part as a snapshot.
- `discountAmount` = coupon / promotion (server-calculated, never trusted from
  the client).
- `walletAmount` + `pointsAmount` are applied before the gateway charge.
- `vatAmount` = derived, never entered by the client.
- `total` = subtotal − discount − wallet − points (VAT-inclusive).
- `paidAmount` = sum of successful `Payment.amount` − refunds.
- `Order.status` is derived: `PAID` when `paidAmount >= total`,
  `PARTIALLY_PAID` when `0 < paidAmount < total`.
- `commissionAmount` = `booking.totalPrice × commissionRateSnapshot`
- `commissionRateSnapshot` is frozen at completion time.

## Error model

All errors use a stable `code` (e.g. `OTP_INVALID`, `BOOKING_CONFLICT`) so the
frontend can map them to Arabic/English messages. HTTP status is meaningful, but
clients should branch on `code`.
