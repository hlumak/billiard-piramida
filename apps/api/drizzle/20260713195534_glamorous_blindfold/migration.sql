CREATE TYPE "booking_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"table_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed'::"booking_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_item_translations" (
	"food_item_id" integer,
	"locale" text,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "food_item_translations_pkey" PRIMARY KEY("food_item_id","locale")
);
--> statement-breakpoint
CREATE TABLE "food_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "food_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL UNIQUE,
	"category" text NOT NULL,
	"price_grosz" integer NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"booking_id" uuid NOT NULL,
	"food_item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_grosz" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" integer PRIMARY KEY,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_table_id_tables_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id");--> statement-breakpoint
ALTER TABLE "food_item_translations" ADD CONSTRAINT "food_item_translations_food_item_id_food_items_id_fkey" FOREIGN KEY ("food_item_id") REFERENCES "food_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_booking_id_bookings_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_food_item_id_food_items_id_fkey" FOREIGN KEY ("food_item_id") REFERENCES "food_items"("id");