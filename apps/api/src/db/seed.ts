import { TABLES_COUNT } from '@repo/shared';
import { LOCAL_DATABASE_URL } from '../lib/config.ts';
import { createDb } from './client.ts';
import { foodItems, foodItemTranslations, tables } from './schema.ts';

const databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;

interface SeedFood {
  slug: string;
  category: 'snack' | 'main' | 'drink' | 'dessert';
  priceGrosz: number;
  uk: [name: string, description: string];
  pl: [name: string, description: string];
  en: [name: string, description: string];
}

const FOOD: SeedFood[] = [
  {
    slug: 'fries',
    category: 'snack',
    priceGrosz: 15_00,
    uk: ['Картопля фрі', 'Хрустка картопля з соусом на вибір'],
    pl: ['Frytki', 'Chrupiące frytki z wybranym sosem'],
    en: ['French fries', 'Crispy fries with a dip of your choice']
  },
  {
    slug: 'nachos',
    category: 'snack',
    priceGrosz: 18_00,
    uk: ['Начос', 'Кукурудзяні чипси з сирним соусом і сальсою'],
    pl: ['Nachos', 'Chipsy kukurydziane z sosem serowym i salsą'],
    en: ['Nachos', 'Corn chips with cheese sauce and salsa']
  },
  {
    slug: 'pierogi',
    category: 'main',
    priceGrosz: 25_00,
    uk: ['Вареники', 'Домашні вареники з картоплею та цибулею'],
    pl: ['Pierogi', 'Domowe pierogi z ziemniakami i cebulą'],
    en: ['Pierogi', 'Homemade dumplings with potato and onion']
  },
  {
    slug: 'burger',
    category: 'main',
    priceGrosz: 32_00,
    uk: ['Бургер', 'Яловичий бургер із сиром та фірмовим соусом'],
    pl: ['Burger', 'Burger wołowy z serem i sosem firmowym'],
    en: ['Burger', 'Beef burger with cheese and house sauce']
  },
  {
    slug: 'caesar-salad',
    category: 'main',
    priceGrosz: 28_00,
    uk: ['Салат Цезар', 'Класичний цезар із куркою та пармезаном'],
    pl: ['Sałatka Cezar', 'Klasyczna sałatka Cezar z kurczakiem i parmezanem'],
    en: ['Caesar salad', 'Classic Caesar with chicken and parmesan']
  },
  {
    slug: 'cola',
    category: 'drink',
    priceGrosz: 8_00,
    uk: ['Кола', 'Охолоджена, 0.33 л'],
    pl: ['Cola', 'Schłodzona, 0,33 l'],
    en: ['Cola', 'Chilled, 0.33 l']
  },
  {
    slug: 'lemonade',
    category: 'drink',
    priceGrosz: 12_00,
    uk: ['Лимонад', 'Домашній лимонад із м’ятою'],
    pl: ['Lemoniada', 'Domowa lemoniada z miętą'],
    en: ['Lemonade', 'Homemade lemonade with mint']
  },
  {
    slug: 'beer',
    category: 'drink',
    priceGrosz: 14_00,
    uk: ['Пиво', 'Світле розливне, 0.5 л'],
    pl: ['Piwo', 'Jasne lane, 0,5 l'],
    en: ['Beer', 'Draft lager, 0.5 l']
  },
  {
    slug: 'coffee',
    category: 'drink',
    priceGrosz: 10_00,
    uk: ['Кава', 'Еспресо, американо або капучино'],
    pl: ['Kawa', 'Espresso, americano lub cappuccino'],
    en: ['Coffee', 'Espresso, americano or cappuccino']
  },
  {
    slug: 'cheesecake',
    category: 'dessert',
    priceGrosz: 16_00,
    uk: ['Чізкейк', 'Ніжний чізкейк із ягідним соусом'],
    pl: ['Sernik', 'Delikatny sernik z sosem jagodowym'],
    en: ['Cheesecake', 'Creamy cheesecake with berry sauce']
  }
];

export async function seed(url: string) {
  const { db, pool } = createDb(url);
  try {
    await db
      .insert(tables)
      .values(Array.from({ length: TABLES_COUNT }, (_, i) => ({ id: i + 1, label: `${i + 1}` })))
      .onConflictDoNothing();

    for (const food of FOOD) {
      // One transaction per item: a crash between the item insert and its
      // translations must not leave a permanently untranslated dish that a
      // re-run (blocked by onConflictDoNothing on the slug) could never repair.
      await db.transaction(async tx => {
        const [existing] = await tx
          .insert(foodItems)
          .values({ slug: food.slug, category: food.category, priceGrosz: food.priceGrosz })
          .onConflictDoNothing()
          .returning({ id: foodItems.id });
        if (!existing) return; // already seeded

        await tx.insert(foodItemTranslations).values(
          (['uk', 'pl', 'en'] as const).map(locale => ({
            foodItemId: existing.id,
            locale,
            name: food[locale][0],
            description: food[locale][1]
          }))
        );
      });
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await seed(databaseUrl);
  console.log('Seed complete');
}
