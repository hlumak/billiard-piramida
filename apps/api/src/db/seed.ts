import { DEFAULT_HOURLY_RATE_GROSZ, DEFAULT_WEEKLY_HOURS, SPOTS } from '@repo/shared';
import { count } from 'drizzle-orm';
import { LOCAL_DATABASE_URL } from '../lib/config.ts';
import { createDb } from './client.ts';
import {
  foodItems,
  foodItemTranslations,
  newsItems,
  newsItemTranslations,
  tables,
  tournaments,
  tournamentTranslations,
  venueHours,
  venueRates
} from './schema.ts';

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

interface SeedNews {
  sortOrder: number;
  linkUrl: string | null;
  uk: [title: string, body: string];
  pl: [title: string, body: string];
  en: [title: string, body: string];
}

/** Starter cards for the home carousel — staff replace these from the admin panel. */
const NEWS: SeedNews[] = [
  {
    sortOrder: 1,
    linkUrl: '/book',
    uk: ['Друга зала відкрита', 'Чотири нові столи 12ft — бронюйте онлайн уже сьогодні.'],
    pl: ['Druga sala otwarta', 'Cztery nowe stoły 12ft — rezerwuj online już dziś.'],
    en: ['Second hall is open', 'Four new 12ft tables — book yours online today.']
  },
  {
    sortOrder: 2,
    linkUrl: '/prices',
    uk: [
      'Знижка за спортивною картою',
      'Multisport, Medicover і FitProfit — −15 зл за кожну карту.'
    ],
    pl: ['Zniżka na kartę sportową', 'Multisport, Medicover i FitProfit — −15 zł za każdą kartę.'],
    en: ['Sport card discount', 'Multisport, Medicover and FitProfit — −15 zł per card.']
  }
];

interface SeedTournamentCopy {
  title: string;
  summary: string;
  details: string;
}

interface SeedTournament {
  slug: string;
  registrationDeadline: string;
  minPlayers: number;
  maxPlayers: number;
  uk: SeedTournamentCopy;
  pl: SeedTournamentCopy;
  en: SeedTournamentCopy;
}

/**
 * The pyramid tournament as the club announced it in August 2026: the 2 August
 * date fell through for lack of players, so there is no `startsOn` — it is
 * played once 16 people are on the roster. The entry fee is deliberately left
 * unset; staff fill in the real amount from the admin panel.
 */
const TOURNAMENTS: SeedTournament[] = [
  {
    slug: 'pyramid-tournament',
    registrationDeadline: '2026-08-30',
    minPlayers: 16,
    maxPlayers: 16,
    uk: {
      title: 'Турнір з піраміди',
      summary: 'Нова реєстрація до 30 серпня — турнір стартує, щойно буде 16 гравців.',
      details:
        'Турнір з піраміди, запланований на 2 серпня, переноситься: попередньо зареєстрованих учасників виявилося замало.\n\n' +
        'Відкрито нову реєстрацію до 30 серпня. Турнір відбудеться, щойно буде 16 зареєстрованих гравців.\n\n' +
        'Заявка з сайту закріплює за вами місце у списку. Щоб підтвердити участь, потрібно підійти на рецепцію клубу та внести турнірний внесок.'
    },
    pl: {
      title: 'Turniej piramidy',
      summary: 'Nowe zapisy do 30 sierpnia — turniej rusza, gdy zbierze się 16 graczy.',
      details:
        'Turniej piramidy zaplanowany na 2 sierpnia zostaje przełożony: zgłosiło się zbyt mało uczestników.\n\n' +
        'Otwieramy nowe zapisy do 30 sierpnia. Turniej odbędzie się, gdy na liście będzie 16 zarejestrowanych graczy.\n\n' +
        'Zgłoszenie ze strony rezerwuje miejsce na liście. Udział potwierdzasz osobiście w recepcji klubu, wpłacając wpisowe.'
    },
    en: {
      title: 'Pyramid tournament',
      summary: 'Sign-ups reopened until 30 August — we play as soon as 16 players are in.',
      details:
        'The pyramid tournament planned for 2 August has been postponed: too few players had signed up in advance.\n\n' +
        'Registration is open again until 30 August. The tournament goes ahead as soon as 16 players are on the roster.\n\n' +
        'Signing up here holds your place on the list. To confirm it, come to the club reception and pay the entry fee.'
    }
  }
];

export async function seed(url: string) {
  const { db, pool } = createDb(url);
  try {
    // Straight from the shared layout so the floor plan and the bookable rows
    // can never disagree. Insert is id-explicit and conflict-free, so re-running
    // after the second hall opened just adds the new spots.
    await db
      .insert(tables)
      .values(SPOTS.map(({ id, label, kind }) => ({ id, label, kind })))
      .onConflictDoNothing();

    // Rates and opening hours are staff-editable, so the seed only puts the
    // opening values in place; onConflictDoNothing keeps a re-run from
    // stamping over whatever the owner has since changed them to.
    await db
      .insert(venueRates)
      .values(
        Object.entries(DEFAULT_HOURLY_RATE_GROSZ).map(([tier, hourlyGrosz]) => ({
          tier,
          hourlyGrosz
        }))
      )
      .onConflictDoNothing();
    await db
      .insert(venueHours)
      .values(
        DEFAULT_WEEKLY_HOURS.map((day, weekday) => ({
          weekday,
          opens: day.open,
          closes: day.close
        }))
      )
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

    // News rows carry no natural key, so an onConflict re-run guard is
    // impossible: seed the starter cards only into an empty carousel, or a
    // second `db:seed` would duplicate whatever staff are already showing.
    const [existingNews] = await db.select({ n: count() }).from(newsItems);
    if ((existingNews?.n ?? 0) === 0) {
      for (const news of NEWS) {
        await db.transaction(async tx => {
          const [item] = await tx
            .insert(newsItems)
            .values({ sortOrder: news.sortOrder, linkUrl: news.linkUrl })
            .returning({ id: newsItems.id });
          if (!item) return;

          await tx.insert(newsItemTranslations).values(
            (['uk', 'pl', 'en'] as const).map(locale => ({
              newsItemId: item.id,
              locale,
              title: news[locale][0],
              body: news[locale][1]
            }))
          );
        });
      }
    }

    // Same reasoning as the news cards: no natural key to re-run against, so
    // the starter tournament only lands in an empty table.
    const [existingTournaments] = await db.select({ n: count() }).from(tournaments);
    if ((existingTournaments?.n ?? 0) === 0) {
      for (const tournament of TOURNAMENTS) {
        await db.transaction(async tx => {
          const [row] = await tx
            .insert(tournaments)
            .values({
              slug: tournament.slug,
              status: 'registration',
              registrationDeadline: tournament.registrationDeadline,
              minPlayers: tournament.minPlayers,
              maxPlayers: tournament.maxPlayers
            })
            .returning({ id: tournaments.id });
          if (!row) return;

          await tx.insert(tournamentTranslations).values(
            (['uk', 'pl', 'en'] as const).map(locale => ({
              tournamentId: row.id,
              locale,
              title: tournament[locale].title,
              summary: tournament[locale].summary,
              details: tournament[locale].details
            }))
          );
        });
      }
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await seed(databaseUrl);
  console.log('Seed complete');
}
