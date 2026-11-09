-- ---------------------------------------------------------------------------
-- Money & integrity constraints that Prisma cannot express in schema.prisma
-- Run after `prisma migrate deploy` (see docs/SETUP.md)
-- ---------------------------------------------------------------------------

-- 1) Money must never go negative.
ALTER TABLE "bookings"
  DROP CONSTRAINT IF EXISTS "bookings_total_price_non_negative";
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_total_price_non_negative" CHECK ("totalPrice" >= 0);

ALTER TABLE "gift_cards"
  DROP CONSTRAINT IF EXISTS "gift_cards_balance_non_negative";
ALTER TABLE "gift_cards"
  ADD CONSTRAINT "gift_cards_balance_non_negative" CHECK ("balance" >= 0);

ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_total_non_negative";
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_non_negative" CHECK ("total" >= 0);

ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_paid_amount_non_negative";
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_paid_amount_non_negative" CHECK ("paidAmount" >= 0);

ALTER TABLE "wallets"
  DROP CONSTRAINT IF EXISTS "wallets_balance_non_negative";
ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0);

ALTER TABLE "loyalty_accounts"
  DROP CONSTRAINT IF EXISTS "loyalty_points_non_negative";
ALTER TABLE "loyalty_accounts"
  ADD CONSTRAINT "loyalty_points_non_negative" CHECK ("pointsBalance" >= 0);

-- 2) A redeemed gift card can never exceed its initial amount.
ALTER TABLE "gift_card_transactions"
  DROP CONSTRAINT IF EXISTS "gift_card_tx_amount_positive";
ALTER TABLE "gift_card_transactions"
  ADD CONSTRAINT "gift_card_tx_amount_positive" CHECK ("amount" > 0);
