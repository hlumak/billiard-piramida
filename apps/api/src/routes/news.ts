import { Type } from '@sinclair/typebox';
import type { Locale, NewsArticleDto, NewsItemDto } from '@repo/shared';
import { DEFAULT_LOCALE, isLocale, isSafeUrl } from '@repo/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { newsItems, newsItemTranslations } from '../db/schema.ts';
import { ERROR_RESPONSE, NEWS_ARTICLE_RESPONSE, NEWS_ITEM_RESPONSE } from '../lib/schemas.ts';
import type { AppInstance } from '../app.ts';

/**
 * Polish is the one translation staff must write, so it is also the one every
 * visitor can be shown: a card without copy in the requested locale falls back
 * to Polish (the menu still falls back to English — its seed has all three).
 */
const FALLBACK_LOCALE = DEFAULT_LOCALE;

type NewsItemRow = typeof newsItems.$inferSelect;
type NewsTranslationRow = typeof newsItemTranslations.$inferSelect;

const LOCALE_QUERY = Type.Object({ locale: Type.Optional(Type.String({ maxLength: 5 })) });
const SLUG_PARAMS = Type.Object({ slug: Type.String({ minLength: 1, maxLength: 80 }) });

function localeOf(requested: string | undefined): Locale {
  const value = requested ?? DEFAULT_LOCALE;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * The requested locale's copy, else Polish, else nothing to show. The article
 * text falls back on its own: a Ukrainian headline over a Polish article beats
 * a card that opens a page for Polish readers only.
 */
export function newsCopyFor(
  translations: NewsTranslationRow[],
  locale: Locale
): NewsTranslationRow | undefined {
  const own = translations.find(t => t.locale === locale);
  const fallback = translations.find(t => t.locale === FALLBACK_LOCALE);
  if (!own) return fallback;
  return hasArticleText(own.content) || !fallback ? own : { ...own, content: fallback.content };
}

export function hasArticleText(content: string | null): boolean {
  return content !== null && content.trim() !== '';
}

export function toNewsItem(item: NewsItemRow, copy: NewsTranslationRow): NewsItemDto {
  return {
    id: item.id,
    slug: item.slug,
    title: copy.title,
    body: copy.body,
    // Rows predating the write-time guard could still hold anything
    imageUrl: item.imageUrl && isSafeUrl(item.imageUrl) ? item.imageUrl : null,
    linkUrl: item.linkUrl && isSafeUrl(item.linkUrl) ? item.linkUrl : null,
    publishedAt: item.createdAt.toISOString(),
    hasArticle: hasArticleText(copy.content)
  };
}

/** Cards without copy in the requested locale fall back to Polish. */
export function newsRoutes(app: AppInstance) {
  app.get(
    '/api/news',
    {
      schema: {
        querystring: LOCALE_QUERY,
        response: { 200: Type.Array(NEWS_ITEM_RESPONSE) }
      }
    },
    async (request): Promise<NewsItemDto[]> => {
      const locale = localeOf(request.query.locale);

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
        const copy = newsCopyFor(
          translations.filter(t => t.newsItemId === item.id),
          locale
        );
        // A card with no usable copy has nothing to show — drop it rather than
        // render an empty slide (unlike a dish, whose slug is a decent fallback).
        return copy ? [toNewsItem(item, copy)] : [];
      });
    }
  );

  // The item's own page. Hidden items 404 like unknown ones: unpublishing must
  // take the page down too, not just the card.
  app.get(
    '/api/news/:slug',
    {
      schema: {
        params: SLUG_PARAMS,
        querystring: LOCALE_QUERY,
        response: { 200: NEWS_ARTICLE_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply): Promise<NewsArticleDto | { error: string }> => {
      const locale = localeOf(request.query.locale);
      const [item] = await app.db
        .select()
        .from(newsItems)
        .where(and(eq(newsItems.slug, request.params.slug), eq(newsItems.isPublished, true)));
      if (!item) return reply.code(404).send({ error: 'not_found' });

      const translations = await app.db
        .select()
        .from(newsItemTranslations)
        .where(eq(newsItemTranslations.newsItemId, item.id));
      const copy = newsCopyFor(translations, locale);
      if (!copy) return reply.code(404).send({ error: 'not_found' });

      return { ...toNewsItem(item, copy), content: copy.content };
    }
  );
}
