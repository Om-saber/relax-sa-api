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
| `catalog` (services, categories, addons, cities, slots) | 2 |
| `cms` (blocks, faq, gallery, media) | 2 |
| `reviews` | 2 |
| `bookings` (availability, state machine, conflicts) | 3 |
| `payments` (Moyasar/Tabby/Tamara, webhooks) | 4 |
| `gift-cards` | 4 |
| `staff` (shifts, off days, commissions, payouts) | 5 |
| `clients` (CRM) | 5 |
| `tickets` | 5 |
| `notifications` (SMS/WhatsApp/Email) | 5 |
| `reports` | 5 |
| `settings` + `feature flags` | 5 |

## Key decisions

1. **Relational DB (PostgreSQL).** Bookings, money, commissions, and reporting
   are relational. Firestore was rejected for this domain.
2. **Single organisation, multi-city.** Every business row carries `cityId`;
   there is no multi-tenant isolation.
3. **Money as `Decimal(10,2)` in SAR, VAT-inclusive.** VAT is derived on the
   invoice (`vatAmount = total * 15 / 115` when `pricesIncludeVat = true`).
4. **Slot-based booking.** Six fixed 2-hour slots. A partial unique index
   prevents the same specialist from holding two live bookings in the same
   date + slot. A configurable travel buffer is enforced in the availability
   service (Phase 3).
5. **Auth split.**
   - Clients: phone + OTP only (no password).
   - Staff/Admin: email + password (Argon2), optional TOTP later.
6. **Token strategy.** Short-lived access token + rotating refresh token stored
   hashed in the DB. `tokenVersion` allows instant global revocation.
7. **Provider abstraction.** SMS, payments, and WhatsApp are interfaces so the
   vendor can change without touching domain code.
8. **Config over code.** Prices, policies, capacities, commissions, and content
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

- `subtotal` = sum of `booking_items.total`
- `discountAmount` = coupon / promo (server-calculated)
- `vatAmount` = derived, never entered by the client
- `totalPrice` = subtotal − discount (VAT-inclusive)
- `commissionAmount` = `totalPrice × commissionRateSnapshot`
- `commissionRateSnapshot` is frozen at completion time.

## Error model

All errors use a stable `code` (e.g. `OTP_INVALID`, `BOOKING_CONFLICT`) so the
frontend can map them to Arabic/English messages. HTTP status is meaningful, but
clients should branch on `code`.
