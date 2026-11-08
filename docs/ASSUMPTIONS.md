# Assumptions

> **Rule:** if an assumption is wrong, we change configuration — not schema.
> Anything that requires a migration is listed in `ARCHITECTURE.md` as a
> locked decision.

| # | Area | Assumption | Cost to change later |
|---|---|---|---|
| 1 | Currency | SAR, stored as `Decimal(10,2)` | Low |
| 2 | VAT | Prices are **VAT-inclusive** at 15%. `vatAmount = total × 15 / 115` | Low (config) |
| 3 | ZATCA | Phase-1 e-invoicing is **not** required at launch | Medium |
| 4 | Payment timing | Pay-on-arrival is the default. Online payment is a feature flag | Low |
| 5 | Deposit | No deposit in MVP | Low |
| 6 | Cancellation | Free until 24h before the slot; 50% fee after that | Low (config) |
| 7 | Reschedule | One free reschedule until 12h before the slot | Low (config) |
| 8 | No-show | Recorded, no automatic fee in MVP | Low |
| 9 | Slots | Six fixed 2-hour slots (10:00 → 00:30) | Medium (schema) |
| 10 | Travel buffer | 30 minutes between bookings for the same specialist | Low (config) |
| 11 | Assignment | Automatic by specialty + city + availability; admin can override | Low |
| 12 | Confirmation | Every booking starts `PENDING`; CS confirms within 2h | Low |
| 13 | Specialist choice | Client **cannot** pick a specialist in MVP (`allowSpecialistSelection=false`) | Low |
| 14 | Lead time | Minimum 2h before the slot; maximum 30 days ahead | Low (config) |
| 15 | Capacity | Per-city daily capacity from `City.maxDailyCapacity` | Low |
| 16 | Launch cities | Riyadh only; Khobar/Dammam/Jeddah seeded but disabled | Low |
| 17 | Identity | Phone is the client identity; guest booking allowed | Medium (schema) |
| 18 | Staff identity | Email + password; phone is a profile field | Low |
| 19 | Admin auth | Email + password; 2FA deferred | Low |
| 20 | Tokens | Access 15m, refresh 30 days, refresh rotation, hashed at rest | Low |
| 21 | Commission | Per-specialist percentage, frozen on completion, paid semi-monthly | Low |
| 22 | Tiers | VIP/Gold/Silver assigned manually by admin | Low |
| 23 | Coupons | Never stack; minimum order 150 SAR | Low |
| 24 | Gift cards | 6-month validity, partial redemption allowed, non-refundable, transferable once | Medium |
| 25 | Reviews | Only after a `COMPLETED` booking; admin approval required | Low |
| 26 | Data retention | 3 years after the last booking | Medium |
| 27 | Hosting region | Start in EU/US; move to KSA/Bahrain if PDPL requires | Medium |
| 28 | Timezone | Asia/Riyadh; dates stored as `date`, timestamps as UTC | Low |
| 29 | Language | Arabic + English stored as `*Ar` / `*En` columns | Medium (schema) |
| 30 | Notifications | WhatsApp is primary in Phase 5; SMS for OTP only | Low |

## Frontend implications

- `AuthContext` becomes a thin wrapper over `/auth/*` + `/users/me`.
- `AdminContext` (currently all CRUD in `localStorage`) is replaced by API calls.
- `BookingContext` keeps cart UI state locally; pricing is re-validated by the API.
- WhatsApp `wa.me` links are replaced by notification jobs in Phase 5.
