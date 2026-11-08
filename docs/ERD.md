# ERD (core)

```mermaid
erDiagram
    USER ||--o| CLIENT_PROFILE : has
    USER ||--o| STAFF_PROFILE : has
    USER }o--|| ROLE : assigned
    ROLE ||--o{ ROLE_PERMISSION : grants
    PERMISSION ||--o{ ROLE_PERMISSION : granted_in
    USER ||--o{ REFRESH_TOKEN : owns

    CITY ||--o{ BRANCH : contains
    CITY ||--o{ COVERAGE_AREA : covers
    CITY ||--o{ BLACKOUT_DATE : blocks
    CITY ||--o{ SERVICE_CITY_PRICE : prices

    SERVICE_CATEGORY ||--o{ SERVICE : contains
    SERVICE ||--o{ SERVICE_ADDON : has
    SERVICE ||--o{ SERVICE_CITY_PRICE : priced_for
    SERVICE ||--o{ STAFF_SERVICE : offered_by
    STAFF_PROFILE ||--o{ STAFF_SERVICE : can_do
    STAFF_PROFILE ||--o{ STAFF_BRANCH : works_at
    STAFF_PROFILE ||--o{ STAFF_OFF_DAY : rests

    CLIENT_PROFILE ||--o{ BOOKING : places
    BOOKING }o--|| CITY : in
    BOOKING }o--o| BRANCH : at
    BOOKING }o--|| TIME_SLOT : scheduled
    BOOKING }o--o| STAFF_PROFILE : assigned_to
    BOOKING ||--o{ BOOKING_ITEM : contains
    BOOKING ||--o{ BOOKING_STATUS_HISTORY : tracks
    BOOKING ||--o{ PAYMENT : paid_by
    BOOKING ||--o| INVOICE : billed
    BOOKING ||--o| COUPON_REDEMPTION : uses
    BOOKING ||--o| REVIEW : reviewed
    BOOKING ||--o| COMMISSION : earns
    BOOKING ||--o{ GIFT_CARD_TRANSACTION : redeemed_with

    STAFF_PROFILE ||--o{ COMMISSION : earns
    STAFF_PROFILE ||--o{ PAYOUT : receives
    PAYOUT ||--o{ COMMISSION : settles

    COUPON ||--o{ COUPON_REDEMPTION : applied
    GIFT_CARD ||--o{ GIFT_CARD_TRANSACTION : ledger

    USER ||--o{ TICKET : creates
    USER ||--o{ TICKET : assigned
    TICKET ||--o{ TICKET_MESSAGE : thread

    USER ||--o{ AUDIT_LOG : acts
    USER ||--o{ NOTIFICATION : receives
```

## Notes

- **Partial unique index** on `bookings (specialistId, date, timeSlotId)` where
  status ∉ (`CANCELLED`, `NO_SHOW`) and `deletedAt IS NULL`.
- Money fields: `Decimal(10,2)`.
- `commissionRateSnapshot` and `commissionAmount` are frozen on the booking when
  it reaches `COMPLETED`.
- `booking_items` snapshot the title and unit price so catalog changes never
  rewrite history.
- `settings` is a key/value JSON store (`booking.settings`, `cms.content`,
  `finance.tax`).
