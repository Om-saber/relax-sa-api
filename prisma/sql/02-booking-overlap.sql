-- ---------------------------------------------------------------------------
-- Double-booking protection
--
-- Why not a UNIQUE index on (specialistId, date, timeSlotId)?
--   1. Services can have different durations (30/60/90/120 minutes).
--   2. A group booking occupies N specialists at once (a team).
--   3. A travel buffer means adjacent bookings can still overlap.
--
-- The "correct" PostgreSQL primitive is:
--   EXCLUDE USING gist (staff_id WITH =, tstzrange(start, end) WITH &&)
-- but that requires the btree_gist extension, which is not available on every
-- managed Postgres. This trigger implements the same rule without extensions
-- and works everywhere.
--
-- It is enforced for both staff and team, and serialises concurrent inserts
-- with advisory locks so a check-then-insert race cannot slip through.
-- Run after `prisma migrate deploy`.
-- ---------------------------------------------------------------------------

-- The legacy slot-based index is wrong as soon as bookings span real ranges.
DROP INDEX IF EXISTS "bookings_no_double_booking_idx";

CREATE OR REPLACE FUNCTION enforce_booking_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conflict_id text;
BEGIN
  -- Nothing to check without a time range or for dead bookings.
  IF NEW."startAt" IS NULL OR NEW."endAt" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."status" IN ('CANCELLED', 'NO_SHOW') OR NEW."deletedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Deterministic lock order (staff, then team) avoids deadlocks.
  IF NEW."specialistId" IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('booking-staff:' || NEW."specialistId")::bigint);
  END IF;
  IF NEW."teamId" IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('booking-team:' || NEW."teamId")::bigint);
  END IF;

  IF NEW."specialistId" IS NOT NULL THEN
    SELECT b.id INTO conflict_id
    FROM "bookings" b
    WHERE b."specialistId" = NEW."specialistId"
      AND b.id <> NEW.id
      AND b."deletedAt" IS NULL
      AND b."status" NOT IN ('CANCELLED', 'NO_SHOW')
      AND b."startAt" IS NOT NULL
      AND b."endAt" IS NOT NULL
      AND tstzrange(b."startAt", b."endAt", '[)')
          && tstzrange(NEW."startAt", NEW."endAt", '[)')
    LIMIT 1;

    IF conflict_id IS NOT NULL THEN
      RAISE EXCEPTION
        'BOOKING_CONFLICT: specialist % already has booking % in this time range',
        NEW."specialistId", conflict_id
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF NEW."teamId" IS NOT NULL THEN
    SELECT b.id INTO conflict_id
    FROM "bookings" b
    WHERE b."teamId" = NEW."teamId"
      AND b.id <> NEW.id
      AND b."deletedAt" IS NULL
      AND b."status" NOT IN ('CANCELLED', 'NO_SHOW')
      AND b."startAt" IS NOT NULL
      AND b."endAt" IS NOT NULL
      AND tstzrange(b."startAt", b."endAt", '[)')
          && tstzrange(NEW."startAt", NEW."endAt", '[)')
    LIMIT 1;

    IF conflict_id IS NOT NULL THEN
      RAISE EXCEPTION
        'BOOKING_CONFLICT: team % already has booking % in this time range',
        NEW."teamId", conflict_id
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "bookings_no_overlap_trigger" ON "bookings";
CREATE TRIGGER "bookings_no_overlap_trigger"
  BEFORE INSERT OR UPDATE OF
    "startAt", "endAt", "status", "specialistId", "teamId", "deletedAt"
  ON "bookings"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_booking_no_overlap();

-- A booking must end after it starts.
ALTER TABLE "bookings"
  DROP CONSTRAINT IF EXISTS "bookings_time_range_valid";
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_time_range_valid"
  CHECK (
    "startAt" IS NULL
    OR "endAt" IS NULL
    OR "endAt" > "startAt"
  );

-- Blocked time ranges and staff leaves must be valid ranges too.
ALTER TABLE "staff_blocked_times"
  DROP CONSTRAINT IF EXISTS "staff_blocked_times_range_valid";
ALTER TABLE "staff_blocked_times"
  ADD CONSTRAINT "staff_blocked_times_range_valid"
  CHECK ("endAt" > "startAt");

ALTER TABLE "staff_leaves"
  DROP CONSTRAINT IF EXISTS "staff_leaves_range_valid";
ALTER TABLE "staff_leaves"
  ADD CONSTRAINT "staff_leaves_range_valid"
  CHECK ("endAt" > "startAt");
