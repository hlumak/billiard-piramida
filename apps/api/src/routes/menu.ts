import { Type } from '@sinclair/typebox';
import type { MenuItemDto } from '@repo/shared';
import { DEFAULT_LOCALE, isLocale } from '@repo/shared';
import { eq, inArray } from 'drizzle-orm';
import { foodItems, foodItemTranslations } from '../db/schema.ts';
import { MENU_ITEM_RESPONSE } from '../lib/schemas.ts';
import type { AppInstance } from '../app.ts';

const FALLBACK_LOCALE = 'en';

export function menuRoutes(app: AppInstance) {
  app.get(
    '/api/menu',
    {
      schema: {
        querystring: Type.Object({
          locale: Type.Optional(Type.String({ maxLength: 5 }))
        }),
        response: { 200: Type.Array(MENU_ITEM_RESPONSE) }
      }
    },
    async (request): Promise<MenuItemDto[]> => {
      const requested = request.query.locale ?? DEFAULT_LOCALE;
      const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

      const items = await app.db
        .select()
        .from(foodItems)
        .where(eq(foodItems.isAvailable, true))
        .orderBy(foodItems.category, foodItems.id);

      if (items.length === 0) return [];

      const translations = await app.db
        .select()
        .from(foodItemTranslations)
        .where(
          inArray(
            foodItemTranslations.locale,
            locale === FALLBACK_LOCALE ? [locale] : [locale, FALLBACK_LOCALE]
          )
        );

      return items.map(item => {
        const forItem = translations.filter(t => t.foodItemId === item.id);
        const best =
          forItem.find(t => t.locale === locale) ?? forItem.find(t => t.locale === FALLBACK_LOCALE);
        return {
          id: item.id,
          slug: item.slug,
          category: item.category,
          priceGrosz: item.priceGrosz,
          name: best?.name ?? item.slug,
          description: best?.description ?? null
        };
      });
    }
  );
}
