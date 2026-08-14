CREATE TABLE "news_item_translations" (
	"news_item_id" integer,
	"locale" text,
	"title" text NOT NULL,
	"body" text,
	CONSTRAINT "news_item_translations_pkey" PRIMARY KEY("news_item_id","locale")
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"image_url" text,
	"link_url" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "news_items_published_sort_idx" ON "news_items" ("is_published","sort_order");--> statement-breakpoint
ALTER TABLE "news_item_translations" ADD CONSTRAINT "news_item_translations_news_item_id_news_items_id_fkey" FOREIGN KEY ("news_item_id") REFERENCES "news_items"("id") ON DELETE CASCADE;