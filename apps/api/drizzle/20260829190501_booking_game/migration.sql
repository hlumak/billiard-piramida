CREATE TYPE "billiard_game" AS ENUM('pool', 'piramida');--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "game" "billiard_game";