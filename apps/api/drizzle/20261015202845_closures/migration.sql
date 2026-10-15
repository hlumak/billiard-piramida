CREATE TABLE "closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"table_ids" integer[],
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closures_ends_after_start" CHECK ("ends_at" > "starts_at")
);
--> statement-breakpoint
CREATE INDEX "closures_ends_at_idx" ON "closures" ("ends_at");