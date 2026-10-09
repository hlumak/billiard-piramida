ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ends_after_start" CHECK ("ends_at" > "starts_at");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_sport_card_count_non_negative" CHECK ("sport_card_count" >= 0);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hourly_rate_non_negative" CHECK ("hourly_rate_grosz" >= 0);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_discount_non_negative" CHECK ("discount_grosz" >= 0);--> statement-breakpoint
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_price_non_negative" CHECK ("price_grosz" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unit_price_grosz" >= 0);--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_min_players_non_negative" CHECK ("min_players" >= 0);--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_start_hour_range" CHECK ("start_hour" between 0 and 23);--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_entry_fee_non_negative" CHECK ("entry_fee_grosz" >= 0);--> statement-breakpoint
ALTER TABLE "venue_hours" ADD CONSTRAINT "venue_hours_weekday_range" CHECK ("weekday" between 0 and 6);--> statement-breakpoint
ALTER TABLE "venue_hours" ADD CONSTRAINT "venue_hours_opens_range" CHECK ("opens" between 0 and 24);--> statement-breakpoint
ALTER TABLE "venue_hours" ADD CONSTRAINT "venue_hours_closes_range" CHECK ("closes" between 0 and 24);--> statement-breakpoint
ALTER TABLE "venue_rates" ADD CONSTRAINT "venue_rates_hourly_non_negative" CHECK ("hourly_grosz" >= 0);