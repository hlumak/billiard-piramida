CREATE TYPE "blacklist_reason" AS ENUM('no_show', 'manual');--> statement-breakpoint
ALTER TYPE "booking_status" ADD VALUE 'no_show';--> statement-breakpoint
CREATE TABLE "blacklist" (
	"phone" text PRIMARY KEY,
	"reason" "blacklist_reason" NOT NULL,
	"booking_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blacklist" ADD CONSTRAINT "blacklist_booking_id_bookings_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL;