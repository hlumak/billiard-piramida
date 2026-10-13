-- Hand-written: drizzle-kit cannot express EXCLUDE constraints.
-- The overlap guard covered every booking that was not cancelled, so a
-- no-show would keep holding its table. Only confirmed bookings occupy a slot
-- now: marking a no-show frees it for a walk-in, and restoring the no-show
-- onto a slot taken since fails with the same exclusion violation as any
-- double booking. The predicate names only 'confirmed', so it may run in the
-- same transaction that added the 'no_show' enum value.
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_no_overlap";
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap" EXCLUDE USING gist (
  table_id WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status = 'confirmed');
