CREATE TYPE "tournament_registration_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "tournament_status" AS ENUM('draft', 'registration', 'closed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "tournament_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tournament_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"user_id" uuid,
	"status" "tournament_registration_status" DEFAULT 'pending'::"tournament_registration_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_translations" (
	"tournament_id" integer,
	"locale" text,
	"title" text NOT NULL,
	"summary" text,
	"details" text,
	CONSTRAINT "tournament_translations_pkey" PRIMARY KEY("tournament_id","locale")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tournaments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL UNIQUE,
	"starts_on" date,
	"start_hour" integer,
	"registration_deadline" date,
	"entry_fee_grosz" integer,
	"min_players" integer DEFAULT 0 NOT NULL,
	"max_players" integer,
	"status" "tournament_status" DEFAULT 'draft'::"tournament_status" NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_registrations_tournament_phone_idx" ON "tournament_registrations" ("tournament_id","phone");--> statement-breakpoint
CREATE INDEX "tournament_registrations_tournament_status_idx" ON "tournament_registrations" ("tournament_id","status");--> statement-breakpoint
CREATE INDEX "tournaments_status_starts_on_idx" ON "tournaments" ("status","starts_on");--> statement-breakpoint
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_tournament_id_tournaments_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "tournament_translations" ADD CONSTRAINT "tournament_translations_tournament_id_tournaments_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE;