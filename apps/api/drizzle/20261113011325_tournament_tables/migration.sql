ALTER TABLE "closures" ADD COLUMN "tournament_id" integer;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "end_hour" integer;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "table_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "closures_tournament_id_idx" ON "closures" ("tournament_id");--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_tournament_id_tournaments_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_end_hour_range" CHECK ("end_hour" between 1 and 26);