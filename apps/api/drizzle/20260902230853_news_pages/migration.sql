ALTER TABLE "news_item_translations" ADD COLUMN "content" text;--> statement-breakpoint
-- Cards written before news had pages get an id-based slug; staff can't rename
-- it, but nothing links to it yet either.
ALTER TABLE "news_items" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "news_items" SET "slug" = 'news-' || "id" WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "news_items" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_slug_key" UNIQUE("slug");
