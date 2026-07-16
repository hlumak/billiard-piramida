CREATE INDEX "bookings_status_starts_at_idx" ON "bookings" ("status","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_customer_phone_idx" ON "bookings" ("customer_phone");--> statement-breakpoint
CREATE INDEX "bookings_user_id_idx" ON "bookings" ("user_id");--> statement-breakpoint
CREATE INDEX "order_items_booking_id_idx" ON "order_items" ("booking_id");