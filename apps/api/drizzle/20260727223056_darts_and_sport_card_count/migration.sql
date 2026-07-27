CREATE TYPE "activity_kind" AS ENUM('billiard', 'darts');--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "sport_card_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "kind" "activity_kind" DEFAULT 'billiard'::"activity_kind" NOT NULL;