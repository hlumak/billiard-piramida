import assert from 'node:assert';
import { Type } from 'typebox';
import { isSafeUrl } from '@repo/shared';
import { and, asc, desc, eq, notInArray, sql } from 'drizzle-orm';
import { newsItems, newsItemTranslations } from '../db/schema.ts';
import { ADMIN_NEWS_ITEM_RESPONSE, ERROR_RESPONSE, INT_ID, LOCALE_SCHEMA } from '../lib/schemas.ts';
import { hasArticleText } from './news.ts';
import { insertWithFreeSlug, slugify } from '../lib/slug.ts';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

type NewsItemRow = typeof newsItems.$inferSelect;
type NewsTranslationRow = typeof newsItemTranslations.$inferSelect;

/** Staff read the carousel in uk, same convention as the menu tab. */
function toAdminNewsItem(item: NewsItemRow, translations: NewsTranslationRow[]) {
  const forItem = translations.filter(t => t.newsItemId === item.id);
  const uk = forItem.find(t => t.locale === 'uk');
  return {
    id: item.id,
    slug: item.slug,
    title: uk?.title ?? forItem[0]?.title ?? '',
    body: uk?.body ?? forItem[0]?.body ?? null,
    imageUrl: item.imageUrl,
    linkUrl: item.linkUrl,
    publishedAt: item.createdAt.toISOString(),
    // Staff care whether ANY locale has a page, not just the one they read in
    hasArticle: forItem.some(t => hasArticleText(t.content)),
    isPublished: item.isPublished,
    sortOrder: item.sortOrder,
    translations: forItem.map(t => ({
      locale: t.locale as 'uk' | 'pl' | 'en',
      title: t.title,
      body: t.body,
      content: t.content
    }))
  };
}

/** Blank input clears the column; anything left must be a safe path or http(s) URL. */
function cleanUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * News cards and articles for the home carousel, with their translations.
 * Registered inside the admin scope (routes/admin.ts), behind its token hook.
 */
export const adminNewsRoutes: FastifyPluginAsyncTypebox = async admin => {
  const NEWS_TRANSLATIONS_BODY = Type.Array(
    Type.Object(
      {
        locale: LOCALE_SCHEMA,
        title: Type.String({ minLength: 1, maxLength: 120 }),
        body: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
        /** Full article in the light markup the web app renders; omitted/blank = card only */
        content: Type.Optional(Type.Union([Type.String({ maxLength: 20_000 }), Type.Null()]))
      },
      { additionalProperties: false }
    ),
    { minItems: 1, maxItems: 3 }
  );

  const NEWS_SLUG = Type.Optional(Type.String({ minLength: 1, maxLength: 80 }));

  const NEWS_URL = Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()]));

  const NEWS_SORT_ORDER = Type.Optional(Type.Integer({ minimum: 0, maximum: 9999 }));

  admin.get(
    '/api/admin/news',
    { schema: { response: { 200: Type.Array(ADMIN_NEWS_ITEM_RESPONSE) } } },
    async () => {
      const [items, translations] = await Promise.all([
        admin.db
          .select()
          .from(newsItems)
          .orderBy(asc(newsItems.sortOrder), desc(newsItems.createdAt)),
        admin.db.select().from(newsItemTranslations)
      ]);
      return items.map(item => toAdminNewsItem(item, translations));
    }
  );

  admin.post(
    '/api/admin/news',
    {
      schema: {
        body: Type.Object(
          {
            /** Omitted: derived from the Polish (or first) title */
            slug: NEWS_SLUG,
            imageUrl: NEWS_URL,
            linkUrl: NEWS_URL,
            sortOrder: NEWS_SORT_ORDER,
            isPublished: Type.Optional(Type.Boolean()),
            translations: NEWS_TRANSLATIONS_BODY
          },
          { additionalProperties: false }
        ),
        response: { 201: ADMIN_NEWS_ITEM_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { sortOrder, isPublished, translations } = request.body;
      const imageUrl = cleanUrl(request.body.imageUrl) ?? null;
      const linkUrl = cleanUrl(request.body.linkUrl) ?? null;
      if ([imageUrl, linkUrl].some(url => url !== null && !isSafeUrl(url))) {
        return reply.code(422).send({ error: 'invalid_url' });
      }

      // Polish is the required copy, so it names the page; an all-Cyrillic
      // title slugifies to nothing and `slugify`'s fallback owns that
      const pl = translations.find(t => t.locale === 'pl');
      const titleForSlug = pl?.title ?? translations[0]?.title ?? '';
      const base = slugify(request.body.slug ?? titleForSlug, 'news');

      const created = await admin.db.transaction(async tx => {
        // Unique slug: base, then base-2, base-3… (atomic, see insertWithFreeSlug)
        const item = await insertWithFreeSlug(base, async slug => {
          const [inserted] = await tx
            .insert(newsItems)
            .values({
              slug,
              imageUrl,
              linkUrl,
              ...(sortOrder !== undefined ? { sortOrder } : {}),
              ...(isPublished !== undefined ? { isPublished } : {})
            })
            .onConflictDoNothing({ target: newsItems.slug })
            .returning();
          return inserted;
        });
        assert(item, 'insert returned no row');
        await tx.insert(newsItemTranslations).values(
          translations.map(t => ({
            newsItemId: item.id,
            locale: t.locale,
            title: t.title.trim(),
            body: t.body?.trim() || null,
            content: t.content?.trim() || null
          }))
        );
        return item;
      });

      const rows = await admin.db
        .select()
        .from(newsItemTranslations)
        .where(eq(newsItemTranslations.newsItemId, created.id));
      return reply.code(201).send(toAdminNewsItem(created, rows));
    }
  );

  admin.patch(
    '/api/admin/news/:id',
    {
      schema: {
        params: Type.Object({ id: INT_ID }),
        body: Type.Object(
          {
            imageUrl: NEWS_URL,
            linkUrl: NEWS_URL,
            sortOrder: NEWS_SORT_ORDER,
            isPublished: Type.Optional(Type.Boolean()),
            translations: Type.Optional(NEWS_TRANSLATIONS_BODY)
          },
          { additionalProperties: false }
        ),
        response: { 200: ADMIN_NEWS_ITEM_RESPONSE, '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      const { sortOrder, isPublished, translations } = request.body;
      // undefined = leave the column alone, null = clear it
      const imageUrl = cleanUrl(request.body.imageUrl);
      const linkUrl = cleanUrl(request.body.linkUrl);
      if ([imageUrl, linkUrl].some(url => typeof url === 'string' && !isSafeUrl(url))) {
        return reply.code(422).send({ error: 'invalid_url' });
      }

      const updated = await admin.db.transaction(async tx => {
        const patch = {
          ...(imageUrl !== undefined ? { imageUrl } : {}),
          ...(linkUrl !== undefined ? { linkUrl } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          ...(isPublished !== undefined ? { isPublished } : {})
        };
        // An all-translations PATCH touches no column of news_items; Drizzle
        // refuses an empty `set`, so read the row instead of updating it.
        const [item] =
          Object.keys(patch).length > 0
            ? await tx
                .update(newsItems)
                .set(patch)
                .where(eq(newsItems.id, request.params.id))
                .returning()
            : await tx.select().from(newsItems).where(eq(newsItems.id, request.params.id));
        if (!item) return null;
        if (translations !== undefined && translations.length > 0) {
          // The set sent is the whole set: a locale the editor cleared is
          // deleted, or its old copy would keep showing to those visitors.
          await tx.delete(newsItemTranslations).where(
            and(
              eq(newsItemTranslations.newsItemId, item.id),
              notInArray(
                newsItemTranslations.locale,
                translations.map(t => t.locale)
              )
            )
          );
          // One statement for all the locales sent, as in the menu PATCH above.
          await tx
            .insert(newsItemTranslations)
            .values(
              translations.map(t => ({
                newsItemId: item.id,
                locale: t.locale,
                title: t.title.trim(),
                body: t.body?.trim() || null,
                content: t.content?.trim() || null
              }))
            )
            .onConflictDoUpdate({
              target: [newsItemTranslations.newsItemId, newsItemTranslations.locale],
              set: {
                title: sql`excluded.title`,
                body: sql`excluded.body`,
                content: sql`excluded.content`
              }
            });
        }
        return item;
      });
      if (!updated) return reply.code(404).send({ error: 'not_found' });

      const rows = await admin.db
        .select()
        .from(newsItemTranslations)
        .where(eq(newsItemTranslations.newsItemId, updated.id));
      return toAdminNewsItem(updated, rows);
    }
  );

  admin.delete(
    '/api/admin/news/:id',
    {
      schema: {
        params: Type.Object({ id: INT_ID }),
        response: { 200: Type.Object({ deleted: Type.Boolean() }), '4xx': ERROR_RESPONSE }
      }
    },
    async (request, reply) => {
      // Translations cascade via FK
      const [deleted] = await admin.db
        .delete(newsItems)
        .where(eq(newsItems.id, request.params.id))
        .returning({ id: newsItems.id });
      if (!deleted) return reply.code(404).send({ error: 'not_found' });
      return { deleted: true };
    }
  );
};
