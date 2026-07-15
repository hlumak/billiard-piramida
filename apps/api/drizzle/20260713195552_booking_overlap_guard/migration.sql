-- Hand-written: drizzle-kit cannot express EXCLUDE constraints.
-- Never regenerate this table from scratch via drizzle-kit — it would drop this guard.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap" EXCLUDE USING gist (
  table_id WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status <> 'cancelled');
