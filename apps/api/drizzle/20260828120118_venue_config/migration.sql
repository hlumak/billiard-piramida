CREATE TABLE "venue_hours" (
	"weekday" integer PRIMARY KEY,
	"opens" integer NOT NULL,
	"closes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_rates" (
	"tier" text PRIMARY KEY,
	"hourly_grosz" integer NOT NULL
);
--> statement-breakpoint
-- Hand-edited: drizzle-kit emits this column as NOT NULL in one statement, which
-- cannot land on a table that already holds bookings. Add it nullable, backfill
-- from the rates that were in force until now, then tighten it.
ALTER TABLE "bookings" ADD COLUMN "hourly_rate_grosz" integer;--> statement-breakpoint
-- Spot ids are permanent (see SPOTS): 1-5 are the 9ft tables, 6-7 the
-- dartboards, 8-11 the 12ft tables in hall 2.
UPDATE "bookings" SET "hourly_rate_grosz" = CASE
	WHEN "table_id" IN (6, 7) THEN 3000
	WHEN "table_id" IN (8, 9, 10, 11) THEN 7000
	ELSE 5000
END WHERE "hourly_rate_grosz" IS NULL;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "hourly_rate_grosz" SET NOT NULL;
