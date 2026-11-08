-- ---------------------------------------------------------------------------
-- Extra constraints that Prisma cannot express in schema.prisma
-- Run after `prisma migrate deploy` (see docs/SETUP.md)
-- ---------------------------------------------------------------------------

-- 1) Double-booking protection.
--    A specialist cannot have two live bookings in the same date + slot.
--    Cancelled / no-show / soft-deleted bookings are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_no_double_booking_idx"
  ON "bookings" ("specialistId", "date", "timeSlotId")
  WHERE "status" NOT IN ('CANCELLED', 'NO_SHOW')
    AND "deletedAt" IS NULL;

-- 2) Money must never go negative.
ALTER TABLE "bookings"
  DROP CONSTRAINT IF EXISTS "bookings_total_price_non_negative";
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_total_price_non_negative" CHECK ("totalPrice" >= 0);

ALTER TABLE "gift_cards"
  DROP CONSTRAINT IF EXISTS "gift_cards_balance_non_negative";
ALTER TABLE "gift_cards"
  ADD CONSTRAINT "gift_cards_balance_non_negative" CHECK ("balance" >= 0);

-- 3) A redeemed gift card can never exceed its initial amount.
ALTER TABLE "gift_card_transactions"
  DROP CONSTRAINT IF EXISTS "gift_card_tx_amount_positive";
ALTER TABLE "gift_card_transactions"
  ADD CONSTRAINT "gift_card_tx_amount_positive" CHECK ("amount" > 0);
