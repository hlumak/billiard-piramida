import { Type } from '@sinclair/typebox';
import type { NewsItemDto } from '@repo/shared';
import { DEFAULT_LOCALE, isLocale, isSafeUrl } from '@repo/shared';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { newsItems, newsItemTranslations } from '../db/schema.ts';
import { NEWS_ITEM_RESPONSE } from '../lib/schemas.ts';
import type { AppInstance } from '../app.ts';

const FALLBACK_LOCALE = 'en';

/** Cards without copy in the requested locale fall back to English, same as /api/menu. */
export function newsRoutes(app: AppInstance) {
  app.get(
    '/api/news',
    {
      schema: {
        querystring: Type.Object({
          locale: Type.Optional(Type.String({ maxLength: 5 }))
        }),
        response: { 200: Type.Array(NEWS_ITEM_RESPONSE) }
      }
    },
    async (request): Promise<NewsItemDto[]> => {
      const requested = request.query.locale ?? DEFAULT_LOCALE;
      const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

      const items = await app.db
        .select()
        .from(newsItems)
        .where(eq(newsItems.isPublished, true))
        .orderBy(asc(newsItems.sortOrder), desc(newsItems.createdAt));

      if (items.length === 0) return [];

      const translations = await app.db
        .select()
        .from(newsItemTranslations)
        .where(
          inArray(
            newsItemTranslations.locale,
            locale === FALLBACK_LOCALE ? [locale] : [locale, FALLBACK_LOCALE]
          )
        );

      return items.flatMap(item => {
        const forItem = translations.filter(t => t.newsItemId === item.id);
        const best =
          forItem.find(t => t.locale === locale) ?? forItem.find(t => t.locale === FALLBACK_LOCALE);
        // A card with no usable copy has nothing to show — drop it rather than
        // render an empty slide (unlike a dish, whose slug is a decent fallback).
        if (!best) return [];
        return [
          {
            id: item.id,
            title: best.title,
            body: best.body,
            // Rows predating the write-time guard could still hold anything
            imageUrl: item.imageUrl && isSafeUrl(item.imageUrl) ? item.imageUrl : null,
            linkUrl: item.linkUrl && isSafeUrl(item.linkUrl) ? item.linkUrl : null
          }
        ];
      });
    }
  );
}
