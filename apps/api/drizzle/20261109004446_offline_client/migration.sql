ALTER TABLE "bookings" ALTER COLUMN "customer_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "customer_phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_both_or_neither" CHECK (("customer_name" is null) = ("customer_phone" is null));--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_online_has_customer" CHECK ("manage_token_hash" is null or "customer_phone" is not null);