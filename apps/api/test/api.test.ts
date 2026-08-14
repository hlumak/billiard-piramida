import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BILLIARD_TABLES_COUNT,
  DARTBOARDS_COUNT,
  HOURLY_RATE_GROSZ,
  SPORT_CARD_DISCOUNT_GROSZ,
  SPOTS_COUNT
} from '@repo/shared';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { buildApp } from '../src/app.ts';
import { LOCAL_DATABASE_URL } from '../src/lib/config.ts';
import { createDb } from '../src/db/client.ts';
import { bookings, users } from '../src/db/schema.ts';
import { seed } from '../src/db/seed.ts';

/** Derived from the shared constants — a rate change must not silently rot these. */
const BILLIARD_HOUR = HOURLY_RATE_GROSZ['9ft'];
const BILLIARD_12FT_HOUR = HOURLY_RATE_GROSZ['12ft'];
const DARTS_HOUR = HOURLY_RATE_GROSZ.darts;
/** Seeded spot ids: 1..5 are 9ft tables, 6..7 dartboards, 8..11 the 12ft ones. */
const DARTBOARD_ID = 6;
const TABLE_12FT_ID = 8;

const ADMIN_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const TEST_URL = ADMIN_URL.replace(/\/[^/]+$/, '/piramida_test');

/**
 * Next date (≥ 7 days out, so always in the future) falling on `weekday`.
 * Computed entirely in UTC so the weekday matches the toISOString() date string
 * (a local getDay()/UTC-slice mix picks the wrong day near the date boundary).
 */
function nextDate(weekday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 + ((weekday - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/** A past date on `weekday` (≥ 7 days ago), for start-in-past assertions. */
function pastDate(weekday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7 - ((d.getUTCDay() - weekday + 7) % 7));
  return d.toISOString().slice(0, 10);
}

const MONDAY = nextDate(1);
const SATURDAY = nextDate(6);

let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS piramida_test WITH (FORCE)');
  await admin.query('CREATE DATABASE piramida_test');
  await admin.end();

  const { db, pool } = createDb(TEST_URL);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  await pool.end();
  await seed(TEST_URL);

  app = await buildApp({
    databaseUrl: TEST_URL,
    logger: false,
    adminToken: 'test-admin-token',
    jwtSecret: 'test-jwt-secret'
  });
  await app.ready();
});

after(async () => {
  await app.close();
});

test('health check responds', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});

test('lists every bookable spot with its kind', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/tables' });
  assert.equal(res.statusCode, 200);
  const spots = res.json();
  assert.equal(spots.length, SPOTS_COUNT);
  assert.equal(
    spots.filter((s: { kind: string }) => s.kind === 'billiard').length,
    BILLIARD_TABLES_COUNT
  );
  assert.equal(spots.filter((s: { kind: string }) => s.kind === 'darts').length, DARTBOARDS_COUNT);
  // Labels number within the kind, so a dartboard is never "table 6"
  assert.deepEqual(
    spots
      .filter((s: { kind: string }) => s.kind === 'darts')
      .map((s: { label: string }) => s.label),
    Array.from({ length: DARTBOARDS_COUNT }, (_, i) => String(i + 1))
  );
});

test('menu is localized with english fallback', async () => {
  const pl = await app.inject({ method: 'GET', url: '/api/menu?locale=pl' });
  const uk = await app.inject({ method: 'GET', url: '/api/menu?locale=uk' });
  const en = await app.inject({ method: 'GET', url: '/api/menu?locale=en' });
  const friesPl = pl.json().find((i: { slug: string }) => i.slug === 'fries');
  const friesUk = uk.json().find((i: { slug: string }) => i.slug === 'fries');
  const friesEn = en.json().find((i: { slug: string }) => i.slug === 'fries');
  assert.equal(friesPl.name, 'Frytki');
  assert.equal(friesUk.name, 'Картопля фрі');
  assert.equal(friesEn.name, 'French fries');
});

test('availability reflects operating hours', async () => {
  const mon = await app.inject({ method: 'GET', url: `/api/availability?date=${MONDAY}` });
  const monBody = mon.json();
  assert.equal(monBody.open, 16);
  assert.equal(monBody.close, 21);
  assert.equal(monBody.tables.length, SPOTS_COUNT);
  assert.deepEqual(
    monBody.tables[0].slots.map((s: { hour: number }) => s.hour),
    [16, 17, 18, 19, 20]
  );

  const sat = await app.inject({ method: 'GET', url: `/api/availability?date=${SATURDAY}` });
  assert.equal(sat.json().open, 15);
  assert.equal(sat.json().close, 23);
});

test('booking lifecycle: create with food, conflict, extend, add food, cancel', async () => {
  const menu = await app.inject({ method: 'GET', url: '/api/menu?locale=en' });
  const fries = menu.json().find((i: { slug: string }) => i.slug === 'fries');
  const beer = menu.json().find((i: { slug: string }) => i.slug === 'beer');

  // create 2h booking with food
  const create = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 1,
      date: MONDAY,
      startHour: 16,
      durationHours: 2,
      customerName: 'Оксана Тест',
      customerPhone: '+48601234567',
      items: [{ foodItemId: fries.id, quantity: 2 }]
    }
  });
  assert.equal(create.statusCode, 201);
  const booking = create.json();
  assert.equal(booking.tableTotalGrosz, 2 * BILLIARD_HOUR);
  assert.equal(booking.kind, 'billiard');
  assert.equal(booking.tableLabel, '1');
  assert.equal(booking.foodTotalGrosz, 2 * fries.priceGrosz);
  assert.equal(booking.totalGrosz, 2 * BILLIARD_HOUR + 2 * fries.priceGrosz);
  assert.equal(booking.phase, 'upcoming');

  // overlapping booking on the same table → 409 via EXCLUDE constraint
  const conflict = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 1,
      date: MONDAY,
      startHour: 17,
      durationHours: 1,
      customerName: 'Conflict',
      customerPhone: '+48600000000'
    }
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error, 'slot_taken');

  // same slot on another table is fine
  const otherTable = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 2,
      date: MONDAY,
      startHour: 17,
      durationHours: 1,
      customerName: 'Sąsiad',
      customerPhone: '+48600000001'
    }
  });
  assert.equal(otherTable.statusCode, 201);

  // availability now shows table 1 busy 16-18
  const avail = await app.inject({ method: 'GET', url: `/api/availability?date=${MONDAY}` });
  const table1 = avail.json().tables.find((t: { tableId: number }) => t.tableId === 1);
  assert.deepEqual(
    table1.slots.map((s: { available: boolean }) => s.available),
    [false, false, true, true, true]
  );

  // extend by 1h (16-19)
  const extend = await app.inject({
    method: 'POST',
    url: `/api/bookings/${booking.id}/extend`,
    payload: { additionalHours: 1 }
  });
  assert.equal(extend.statusCode, 200);
  assert.equal(extend.json().tableTotalGrosz, 3 * BILLIARD_HOUR);

  // extending past closing time (21:00) → 422
  const tooLong = await app.inject({
    method: 'POST',
    url: `/api/bookings/${booking.id}/extend`,
    payload: { additionalHours: 5 }
  });
  assert.equal(tooLong.statusCode, 422);
  assert.equal(tooLong.json().error, 'past_closing_time');

  // add more food to the order
  const addFood = await app.inject({
    method: 'POST',
    url: `/api/bookings/${booking.id}/items`,
    payload: { items: [{ foodItemId: beer.id, quantity: 3 }] }
  });
  assert.equal(addFood.statusCode, 200);
  assert.equal(addFood.json().foodTotalGrosz, 2 * fries.priceGrosz + 3 * beer.priceGrosz);

  // unknown food item → 422
  const badFood = await app.inject({
    method: 'POST',
    url: `/api/bookings/${booking.id}/items`,
    payload: { items: [{ foodItemId: 99999, quantity: 1 }] }
  });
  assert.equal(badFood.statusCode, 422);

  // cancel frees the slot
  const cancel = await app.inject({ method: 'POST', url: `/api/bookings/${booking.id}/cancel` });
  assert.equal(cancel.statusCode, 200);
  assert.equal(cancel.json().phase, 'cancelled');

  const rebook = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 1,
      date: MONDAY,
      startHour: 16,
      durationHours: 1,
      customerName: 'Nowy Gość',
      customerPhone: '+48600000002'
    }
  });
  assert.equal(rebook.statusCode, 201);
});

test('rejects bookings outside operating hours', async () => {
  for (const [startHour, durationHours] of [
    [15, 1], // Monday opens at 16
    [20, 2], // would end at 22, Monday closes at 21
    [21, 1] // cannot start at closing hour
  ]) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        tableId: 3,
        date: MONDAY,
        startHour,
        durationHours,
        customerName: 'X',
        customerPhone: '+48600000003'
      }
    });
    assert.equal(res.statusCode, 422, `startHour=${startHour} duration=${durationHours}`);
    assert.equal(res.json().error, 'outside_operating_hours');
  }
});

test('validation rejects malformed input', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: { tableId: 'one', date: MONDAY }
  });
  assert.equal(res.statusCode, 400);

  const notFound = await app.inject({
    method: 'GET',
    url: '/api/bookings/00000000-0000-0000-0000-000000000000'
  });
  assert.equal(notFound.statusCode, 404);
});

test('admin endpoints require the token', async () => {
  const noToken = await app.inject({ method: 'GET', url: '/api/admin/stats' });
  assert.equal(noToken.statusCode, 401);

  const badToken = await app.inject({
    method: 'GET',
    url: '/api/admin/bookings',
    headers: { 'x-admin-token': 'wrong' }
  });
  assert.equal(badToken.statusCode, 401);
});

test('admin stats, bookings and customers respond with data', async () => {
  const headers = { 'x-admin-token': 'test-admin-token' };

  // Create a booking so the admin views have content
  const created = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 3,
      date: nextDate(6),
      startHour: 17,
      durationHours: 2,
      customerName: 'Admin Test',
      customerPhone: '+48 700 800 900',
      items: [{ foodItemId: 1, quantity: 2 }]
    }
  });
  assert.equal(created.statusCode, 201);

  // Same window on a 12ft table. The admin rental sums bill in SQL off a CASE
  // generated from SPOTS, so this is the assertion that pins that CASE to the
  // rate `hourlyRateGrosz` hands the rest of the app.
  const createdBig = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: TABLE_12FT_ID,
      date: nextDate(6),
      startHour: 17,
      durationHours: 2,
      customerName: 'Admin Test 12ft',
      customerPhone: '+48 700 800 901'
    }
  });
  assert.equal(createdBig.statusCode, 201);

  const stats = await app.inject({ method: 'GET', url: '/api/admin/stats', headers });
  assert.equal(stats.statusCode, 200);
  const statsBody = stats.json();
  assert.ok(typeof statsBody.todayBookings === 'number');
  assert.ok(typeof statsBody.weekRevenueGrosz === 'number');
  assert.ok(Array.isArray(statsBody.topItems));

  const bookingsRes = await app.inject({
    method: 'GET',
    url: `/api/admin/bookings?date=${nextDate(6)}`,
    headers
  });
  assert.equal(bookingsRes.statusCode, 200);
  const list = bookingsRes.json();
  assert.ok(list.length >= 1);
  const found = list.find((b: { customerName: string }) => b.customerName === 'Admin Test');
  assert.ok(found);
  assert.equal(found.items.length, 1);
  assert.equal(found.totalGrosz, 2 * BILLIARD_HOUR + 2 * found.items[0].unitPriceGrosz);

  const customers = await app.inject({ method: 'GET', url: '/api/admin/customers', headers });
  assert.equal(customers.statusCode, 200);
  const customer = customers.json().find((c: { phone: string }) => c.phone === '+48700800900');
  assert.ok(customer);
  assert.equal(customer.name, 'Admin Test');
  assert.ok(customer.bookingsCount >= 1);
  assert.ok(customer.totalSpentGrosz > 0);

  // One booking each, so these totals are exact — and they differ only by cloth
  const bigCustomer = customers.json().find((c: { phone: string }) => c.phone === '+48700800901');
  assert.ok(bigCustomer);
  assert.equal(bigCustomer.totalSpentGrosz, 2 * BILLIARD_12FT_HOUR);
  assert.equal(customer.totalSpentGrosz, 2 * BILLIARD_HOUR + 2 * found.items[0].unitPriceGrosz);
});

test('websocket subscribers hear availability changes', async () => {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/ws`);

  const messages: { type: string; date: string }[] = [];
  ws.addEventListener('message', event => {
    messages.push(JSON.parse(String(event.data)));
  });
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('ws connect failed')));
  });
  ws.send(JSON.stringify({ type: 'subscribe', date: SATURDAY }));
  // Subscription is processed asynchronously on the server
  await new Promise(resolve => setTimeout(resolve, 100));

  const created = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 5,
      date: SATURDAY,
      startHour: 18,
      durationHours: 1,
      customerName: 'WS Test',
      customerPhone: '+48 111 222 333'
    }
  });
  assert.equal(created.statusCode, 201);

  // Wait for the broadcast
  for (let i = 0; i < 50 && messages.length === 0; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  ws.close();

  assert.ok(messages.length >= 1, 'expected an availability_changed message');
  assert.deepEqual(messages[0], { type: 'availability_changed', date: SATURDAY });
});

test('auth: register, login, profile update', async () => {
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { phone: '+48 600 700 800', name: 'Auth Test', password: 'secret-pass-1' }
  });
  assert.equal(registered.statusCode, 201);
  const { token, profile } = registered.json();
  assert.ok(token.length > 20);
  assert.equal(profile.sportCardType, null);

  const dupe = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { phone: '+48 600 700 800', name: 'Dupe', password: 'secret-pass-1' }
  });
  assert.equal(dupe.statusCode, 409);

  const badLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { phone: '+48 600 700 800', password: 'wrong-password' }
  });
  assert.equal(badLogin.statusCode, 401);

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { phone: '+48 600 700 800', password: 'secret-pass-1' }
  });
  assert.equal(login.statusCode, 200);

  const auth = { authorization: `Bearer ${login.json().token}` };
  const updated = await app.inject({
    method: 'PATCH',
    url: '/api/auth/me',
    headers: auth,
    payload: { sportCardType: 'multisport', sportCardNumber: 'MS-123456' }
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().sportCardType, 'multisport');

  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().sportCardNumber, 'MS-123456');

  const anon = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(anon.statusCode, 401);
});

test('discounts: 15 zl per sport card, stacking, capped at the rental', async () => {
  // One card on a 2h billiard booking — flat 15 zł off, no account needed
  const oneCard = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 4,
      date: MONDAY,
      startHour: 16,
      durationHours: 2,
      customerName: 'One Card',
      customerPhone: '+48 111 000 111',
      sportCardCount: 1
    }
  });
  assert.equal(oneCard.statusCode, 201);
  const oneDto = oneCard.json();
  assert.equal(oneDto.sportCardCount, 1);
  assert.equal(oneDto.discountGrosz, SPORT_CARD_DISCOUNT_GROSZ);
  assert.equal(oneDto.totalGrosz, 2 * BILLIARD_HOUR - SPORT_CARD_DISCOUNT_GROSZ);

  // Two partners, two cards — they stack
  const twoCards = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 4,
      date: MONDAY,
      startHour: 18,
      durationHours: 3,
      customerName: 'Two Cards',
      customerPhone: '+48 222 000 222',
      sportCardCount: 2
    }
  });
  assert.equal(twoCards.statusCode, 201);
  const twoDto = twoCards.json();
  assert.equal(twoDto.discountGrosz, 2 * SPORT_CARD_DISCOUNT_GROSZ);
  assert.equal(twoDto.totalGrosz, 3 * BILLIARD_HOUR - 2 * SPORT_CARD_DISCOUNT_GROSZ);

  // Hall 2 is 12ft and bills higher; the card discount is flat all the same.
  // The owner's worked example, on the dearer cloth: 4h × 70 − 4 × 15 = 220.
  const bigTable = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: TABLE_12FT_ID,
      date: MONDAY,
      startHour: 16,
      durationHours: 4,
      customerName: 'Twelve Foot',
      customerPhone: '+48 555 000 555',
      sportCardCount: 4
    }
  });
  assert.equal(bigTable.statusCode, 201);
  const bigDto = bigTable.json();
  assert.equal(bigDto.tableLabel, '6');
  assert.equal(bigDto.tableTotalGrosz, 4 * BILLIARD_12FT_HOUR);
  assert.equal(bigDto.discountGrosz, 4 * SPORT_CARD_DISCOUNT_GROSZ);
  assert.equal(bigDto.totalGrosz, 4 * BILLIARD_12FT_HOUR - 4 * SPORT_CARD_DISCOUNT_GROSZ);

  // Policy example: one darts hour with two cards is free, never negative
  const darts = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: DARTBOARD_ID,
      date: MONDAY,
      startHour: 16,
      durationHours: 1,
      customerName: 'Darts Pair',
      customerPhone: '+48 444 000 444',
      sportCardCount: 2
    }
  });
  assert.equal(darts.statusCode, 201);
  const dartsDto = darts.json();
  assert.equal(dartsDto.kind, 'darts');
  assert.equal(dartsDto.tableLabel, '1');
  assert.equal(dartsDto.tableTotalGrosz, DARTS_HOUR);
  assert.equal(dartsDto.discountGrosz, DARTS_HOUR);
  assert.equal(dartsDto.totalGrosz, 0);

  // Extending uncaps a clipped discount: 2 cards = 30 zł, now under a 2h rental
  const extended = await app.inject({
    method: 'POST',
    url: `/api/bookings/${dartsDto.id}/extend`,
    payload: { additionalHours: 1 }
  });
  assert.equal(extended.statusCode, 200);
  assert.equal(extended.json().discountGrosz, 2 * SPORT_CARD_DISCOUNT_GROSZ);

  // No cards declared — no discount
  const guest = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 5,
      date: MONDAY,
      startHour: 16,
      durationHours: 1,
      customerName: 'Guest',
      customerPhone: '+48 333 000 333'
    }
  });
  assert.equal(guest.statusCode, 201);
  assert.equal(guest.json().sportCardCount, 0);
  assert.equal(guest.json().discountGrosz, 0);
  assert.equal(guest.json().totalGrosz, BILLIARD_HOUR);

  // Above the per-booking ceiling the request is rejected outright
  const tooMany = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 2,
      date: MONDAY,
      startHour: 19,
      durationHours: 1,
      customerName: 'Too Many',
      customerPhone: '+48 555 000 555',
      sportCardCount: 99
    }
  });
  assert.equal(tooMany.statusCode, 400);
});

test('club cards are retired: the field is ignored, never stored', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      phone: '+48 999 000 999',
      name: 'No Club Card',
      password: 'secret-pass-9',
      clubCardNumber: '0005'
    }
  });
  // Stripped by the schema rather than rejected, so older clients still register
  assert.equal(res.statusCode, 201);
  const profile = res.json().profile;
  assert.equal('clubCardNumber' in profile, false);

  const { db, pool } = createDb(TEST_URL);
  const [row] = await db.select().from(users).where(eq(users.phone, '+48999000999'));
  await pool.end();
  assert.ok(row);
  assert.equal(row.clubCardNumber, null);
});

test('admin CRM: create walk-in booking, staff cancel, analytics, menu patch', async () => {
  const headers = { 'x-admin-token': 'test-admin-token' };

  // Create a walk-in booking from the reception desk
  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/bookings',
    headers,
    payload: {
      tableId: 2,
      date: SATURDAY,
      startHour: 20,
      durationHours: 1,
      customerName: 'Walk In',
      customerPhone: '+48 444 555 666'
    }
  });
  assert.equal(created.statusCode, 201);
  const dto = created.json();
  assert.equal(dto.tableId, 2);

  // Phone search finds it
  const searched = await app.inject({
    method: 'GET',
    url: '/api/admin/bookings?phone=444555',
    headers
  });
  assert.equal(searched.statusCode, 200);
  assert.ok(searched.json().some((b: { id: string }) => b.id === dto.id));

  // Staff cancel works on an upcoming booking
  const cancelled = await app.inject({
    method: 'POST',
    url: `/api/admin/bookings/${dto.id}/cancel`,
    headers
  });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().status, 'cancelled');

  // Analytics: dense daily series + utilization + start hours
  const analytics = await app.inject({
    method: 'GET',
    url: '/api/admin/analytics?days=14',
    headers
  });
  assert.equal(analytics.statusCode, 200);
  const stats = analytics.json();
  assert.equal(stats.days, 14);
  assert.equal(stats.daily.length, 14);
  assert.equal(stats.tables.length, SPOTS_COUNT);
  assert.ok(stats.tables.every((t: { openHours: number }) => t.openHours > 0));

  // Menu management: price + availability round-trip
  const menuBefore = await app.inject({ method: 'GET', url: '/api/menu?locale=uk' });
  const fries = menuBefore.json().find((i: { slug: string }) => i.slug === 'fries');
  const patched = await app.inject({
    method: 'PATCH',
    url: `/api/admin/menu/${fries.id}`,
    headers,
    payload: { priceGrosz: 17_00, isAvailable: false }
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().priceGrosz, 17_00);

  const menuAfter = await app.inject({ method: 'GET', url: '/api/menu?locale=uk' });
  assert.ok(!menuAfter.json().some((i: { slug: string }) => i.slug === 'fries'));

  // restore
  await app.inject({
    method: 'PATCH',
    url: `/api/admin/menu/${fries.id}`,
    headers,
    payload: { priceGrosz: 15_00, isAvailable: true }
  });
});

test('admin menu CRUD: create with translations, edit, delete guard', async () => {
  const headers = { 'x-admin-token': 'test-admin-token' };

  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/menu',
    headers,
    payload: {
      category: 'dessert',
      priceGrosz: 22_00,
      translations: [
        { locale: 'uk', name: 'Тірамісу', description: 'Класичний десерт' },
        { locale: 'pl', name: 'Tiramisu' },
        { locale: 'en', name: 'Tiramisu' }
      ]
    }
  });
  assert.equal(created.statusCode, 201);
  const dish = created.json();
  assert.equal(dish.slug, 'tiramisu');
  assert.equal(dish.translations.length, 3);

  // Localized storefront picks it up
  const menuPl = await app.inject({ method: 'GET', url: '/api/menu?locale=pl' });
  assert.ok(menuPl.json().some((i: { name: string }) => i.name === 'Tiramisu'));

  // Edit a translation + category
  const patched = await app.inject({
    method: 'PATCH',
    url: `/api/admin/menu/${dish.id}`,
    headers,
    payload: {
      category: 'snack',
      translations: [{ locale: 'pl', name: 'Tiramisu klasyczne', description: 'Deser włoski' }]
    }
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().category, 'snack');
  const plRow = patched.json().translations.find((t: { locale: string }) => t.locale === 'pl');
  assert.equal(plRow.name, 'Tiramisu klasyczne');

  // Fresh dish deletes cleanly
  const deleted = await app.inject({
    method: 'DELETE',
    url: `/api/admin/menu/${dish.id}`,
    headers
  });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.json(), { deleted: true });

  // A dish present in orders is protected (fries were ordered in earlier tests)
  const menuUk = await app.inject({ method: 'GET', url: '/api/menu?locale=uk' });
  const fries = menuUk.json().find((i: { slug: string }) => i.slug === 'fries');
  const blocked = await app.inject({
    method: 'DELETE',
    url: `/api/admin/menu/${fries.id}`,
    headers
  });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.json().error, 'has_orders');
});

test('news is localized, published-only, and ordered by sort order', async () => {
  const pl = await app.inject({ method: 'GET', url: '/api/news?locale=pl' });
  assert.equal(pl.statusCode, 200);
  const cards = pl.json();
  assert.equal(cards.length, 2);
  assert.equal(cards[0].title, 'Druga sala otwarta');
  assert.equal(cards[0].linkUrl, '/book');
  // Ascending sortOrder, seeded 1 then 2
  assert.equal(cards[1].title, 'Zniżka na kartę sportową');

  // Unknown locale falls back to the default locale's copy, not a crash
  const bogus = await app.inject({ method: 'GET', url: '/api/news?locale=xx' });
  assert.equal(bogus.statusCode, 200);
  assert.equal(bogus.json()[0].title, 'Druga sala otwarta');
});

test('admin news CRUD: create, hide, reorder, url guard, delete', async () => {
  const headers = { 'x-admin-token': 'test-admin-token' };

  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/news',
    headers,
    payload: {
      sortOrder: 0,
      imageUrl: '/news/cup.webp',
      linkUrl: 'https://example.com/cup',
      translations: [
        { locale: 'uk', title: 'Турнір', body: 'Реєстрація відкрита' },
        { locale: 'pl', title: 'Turniej' },
        { locale: 'en', title: 'Tournament' }
      ]
    }
  });
  assert.equal(created.statusCode, 201);
  const card = created.json();
  assert.equal(card.title, 'Турнір'); // staff view is uk
  assert.equal(card.isPublished, true);
  assert.equal(card.translations.length, 3);

  // sortOrder 0 puts it in front of the seeded cards on the storefront
  const front = await app.inject({ method: 'GET', url: '/api/news?locale=pl' });
  assert.equal(front.json()[0].title, 'Turniej');
  assert.equal(front.json()[0].imageUrl, '/news/cup.webp');

  // Hidden cards leave the carousel but stay in the staff list
  const hidden = await app.inject({
    method: 'PATCH',
    url: `/api/admin/news/${card.id}`,
    headers,
    payload: { isPublished: false }
  });
  assert.equal(hidden.statusCode, 200);
  assert.equal(hidden.json().isPublished, false);
  const withoutHidden = await app.inject({ method: 'GET', url: '/api/news?locale=pl' });
  assert.ok(!withoutHidden.json().some((n: { title: string }) => n.title === 'Turniej'));
  const staffList = await app.inject({ method: 'GET', url: '/api/admin/news', headers });
  assert.ok(staffList.json().some((n: { id: number }) => n.id === card.id));

  // A translations-only PATCH touches no news_items column — must still work
  const retitled = await app.inject({
    method: 'PATCH',
    url: `/api/admin/news/${card.id}`,
    headers,
    payload: { translations: [{ locale: 'pl', title: 'Turniej klubowy', body: 'Zapisy trwają' }] }
  });
  assert.equal(retitled.statusCode, 200);
  const plRow = retitled.json().translations.find((t: { locale: string }) => t.locale === 'pl');
  assert.equal(plRow.title, 'Turniej klubowy');
  assert.equal(retitled.json().isPublished, false); // untouched by the patch

  // Blank clears a URL column
  const cleared = await app.inject({
    method: 'PATCH',
    url: `/api/admin/news/${card.id}`,
    headers,
    payload: { imageUrl: '   ', isPublished: true }
  });
  assert.equal(cleared.json().imageUrl, null);

  // Anything that is not a path or an http(s) URL is rejected on write
  for (const linkUrl of ['javascript:alert(1)', '//evil.example', '/\\evil.example']) {
    const rejected = await app.inject({
      method: 'PATCH',
      url: `/api/admin/news/${card.id}`,
      headers,
      payload: { linkUrl }
    });
    assert.equal(rejected.statusCode, 422);
    assert.equal(rejected.json().error, 'invalid_url');
  }

  const deleted = await app.inject({
    method: 'DELETE',
    url: `/api/admin/news/${card.id}`,
    headers
  });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.json(), { deleted: true });
  const gone = await app.inject({
    method: 'DELETE',
    url: `/api/admin/news/${card.id}`,
    headers
  });
  assert.equal(gone.statusCode, 404);

  // The carousel requires a session, the storefront does not
  const unauthorized = await app.inject({ method: 'GET', url: '/api/admin/news' });
  assert.equal(unauthorized.statusCode, 401);
});

test('phones are validated and normalized to E.164', async () => {
  // Garbage rejected
  const bad = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 5,
      date: MONDAY,
      startHour: 17,
      durationHours: 1,
      customerName: 'Bad Phone',
      customerPhone: '12345'
    }
  });
  assert.equal(bad.statusCode, 422);
  assert.equal(bad.json().error, 'invalid_phone');

  // Polish national format normalized with the +48 prefix
  const national = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 5,
      date: MONDAY,
      startHour: 17,
      durationHours: 1,
      customerName: 'National Format',
      customerPhone: '601 234 567'
    }
  });
  assert.equal(national.statusCode, 201);
  assert.equal(national.json().customerPhone, '+48601234567');

  // Ukrainian international number accepted as-is
  const ua = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: {
      tableId: 5,
      date: MONDAY,
      startHour: 18,
      durationHours: 1,
      customerName: 'UA Guest',
      customerPhone: '+380 67 123 45 67'
    }
  });
  assert.equal(ua.statusCode, 201);
  assert.equal(ua.json().customerPhone, '+380671234567');

  // Registration normalizes too, and login matches any input format
  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { phone: '601-777-888', name: 'Norm User', password: 'password-123' }
  });
  assert.equal(reg.statusCode, 201);
  assert.equal(reg.json().profile.phone, '+48601777888');

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { phone: '+48 601 777 888', password: 'password-123' }
  });
  assert.equal(login.statusCode, 200);
});

// Each of the tests below runs behind its own X-Forwarded-For IP (honored by
// trustProxy: 1) so their requests get isolated rate-limit buckets and never
// exhaust the shared 127.0.0.1 quota the other tests rely on.

test('guest phone lookup returns only active bookings and normalizes the query', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.1' };
  const created = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: ip,
    payload: {
      tableId: 3,
      date: MONDAY,
      startHour: 16,
      durationHours: 1,
      customerName: 'Lookup Guest',
      customerPhone: '+48 512 100 100'
    }
  });
  assert.equal(created.statusCode, 201);
  const id = created.json().id;

  // National-format query must match the E.164-stored number
  const found = await app.inject({
    method: 'GET',
    url: '/api/bookings/lookup?phone=512100100',
    headers: ip
  });
  assert.equal(found.statusCode, 200);
  assert.ok(found.json().some((b: { id: string }) => b.id === id));

  // Cancelled bookings drop out of the recovery list
  await app.inject({ method: 'POST', url: `/api/bookings/${id}/cancel`, headers: ip });
  const afterCancel = await app.inject({
    method: 'GET',
    url: '/api/bookings/lookup?phone=512100100',
    headers: ip
  });
  assert.equal(afterCancel.json().length, 0);

  // A number with no bookings returns an empty list, not an error
  const none = await app.inject({
    method: 'GET',
    url: '/api/bookings/lookup?phone=999888777',
    headers: ip
  });
  assert.equal(none.statusCode, 200);
  assert.deepEqual(none.json(), []);
});

test('lookup is rate limited to 10 requests per minute', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.2' };
  let limited = false;
  for (let i = 0; i < 11; i++) {
    const res = await app.inject({
      method: 'GET',
      url: '/api/bookings/lookup?phone=500500500',
      headers: ip
    });
    if (res.statusCode === 429) limited = true;
  }
  assert.ok(limited, 'expected a 429 within 11 rapid lookups');
});

test('failed create with an unknown food item leaves no phantom booking', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.3' };
  const slot = { tableId: 3, date: MONDAY, startHour: 17, durationHours: 1 };

  const bad = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: ip,
    payload: {
      ...slot,
      customerName: 'Rollback',
      customerPhone: '+48 512 200 200',
      items: [{ foodItemId: 99999, quantity: 1 }]
    }
  });
  assert.equal(bad.statusCode, 422);
  assert.equal(bad.json().error, 'unknown_food_item');

  // The rolled-back attempt must not have held the slot
  const good = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: ip,
    payload: { ...slot, customerName: 'After Rollback', customerPhone: '+48 512 200 201' }
  });
  assert.equal(good.statusCode, 201);
});

test('extend colliding with a later booking on the same table returns 409', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.4' };
  const first = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: ip,
    payload: {
      tableId: 3,
      date: MONDAY,
      startHour: 18,
      durationHours: 1,
      customerName: 'Extend A',
      customerPhone: '+48 512 300 300'
    }
  });
  assert.equal(first.statusCode, 201);
  const firstId = first.json().id;

  // A later booking leaves a 19–20 gap after the first (18–19)
  const later = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: ip,
    payload: {
      tableId: 3,
      date: MONDAY,
      startHour: 20,
      durationHours: 1,
      customerName: 'Extend B',
      customerPhone: '+48 512 300 301'
    }
  });
  assert.equal(later.statusCode, 201);

  // Extending the first to 18–21 overlaps the 20–21 booking → EXCLUDE fires
  const collide = await app.inject({
    method: 'POST',
    url: `/api/bookings/${firstId}/extend`,
    headers: ip,
    payload: { additionalHours: 2 }
  });
  assert.equal(collide.statusCode, 409);
  assert.equal(collide.json().error, 'slot_taken');

  // Extending into the free gap (18–20) still succeeds
  const ok = await app.inject({
    method: 'POST',
    url: `/api/bookings/${firstId}/extend`,
    headers: ip,
    payload: { additionalHours: 1 }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().tableTotalGrosz, 2 * BILLIARD_HOUR);
});

test('bookings in the past are rejected on public and admin create', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.5' };
  const lastMonday = pastDate(1);

  const pub = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: ip,
    payload: {
      tableId: 1,
      date: lastMonday,
      startHour: 16,
      durationHours: 1,
      customerName: 'Past',
      customerPhone: '+48 512 400 400'
    }
  });
  assert.equal(pub.statusCode, 422);
  assert.equal(pub.json().error, 'start_in_past');

  const admin = await app.inject({
    method: 'POST',
    url: '/api/admin/bookings',
    headers: { ...ip, 'x-admin-token': 'test-admin-token' },
    payload: {
      tableId: 1,
      date: lastMonday,
      startHour: 16,
      durationHours: 1,
      customerName: 'Past Admin',
      customerPhone: '+48 512 400 401'
    }
  });
  assert.equal(admin.statusCode, 422);
  assert.equal(admin.json().error, 'start_in_past');
});

test('active booking: public cancel is rejected, admin cancel succeeds', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.6' };
  const { db, pool } = createDb(TEST_URL);
  const now = Date.now();
  const [row] = await db
    .insert(bookings)
    .values({
      tableId: 1,
      customerName: 'Active Now',
      customerPhone: '+48512500500',
      startsAt: new Date(now - 30 * 60_000),
      endsAt: new Date(now + 90 * 60_000)
    })
    .returning({ id: bookings.id });
  await pool.end();
  assert.ok(row);

  // Public cancel only allows upcoming bookings
  const pub = await app.inject({
    method: 'POST',
    url: `/api/bookings/${row.id}/cancel`,
    headers: ip
  });
  assert.equal(pub.statusCode, 409);
  assert.equal(pub.json().error, 'only_upcoming_can_be_cancelled');

  // Staff may cancel an in-progress booking
  const admin = await app.inject({
    method: 'POST',
    url: `/api/admin/bookings/${row.id}/cancel`,
    headers: { ...ip, 'x-admin-token': 'test-admin-token' }
  });
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.json().phase, 'cancelled');
});

test('auth-disabled mode: auth/admin return 503 but guest booking still works', async () => {
  // No adminToken and no jwtSecret → accounts + admin are fully optional/off
  const disabled = await buildApp({ databaseUrl: TEST_URL, logger: false });
  await disabled.ready();
  try {
    const ip = { 'x-forwarded-for': '198.51.100.7' };

    const login = await disabled.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: ip,
      payload: { phone: '+48600000009', password: 'whatever-pass' }
    });
    assert.equal(login.statusCode, 503);
    assert.equal(login.json().error, 'auth_disabled');

    const register = await disabled.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: ip,
      payload: { phone: '+48600000010', name: 'Nobody', password: 'whatever-pass' }
    });
    assert.equal(register.statusCode, 503);

    const adminStats = await disabled.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: ip
    });
    assert.equal(adminStats.statusCode, 503);
    assert.equal(adminStats.json().error, 'admin_disabled');

    // Booking without auth is unaffected — guests never needed accounts
    const guest = await disabled.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: ip,
      payload: {
        tableId: 1,
        date: SATURDAY,
        startHour: 15,
        durationHours: 1,
        customerName: 'No Auth Guest',
        customerPhone: '+48600000011'
      }
    });
    assert.equal(guest.statusCode, 201);
    assert.equal(guest.json().discountGrosz, 0);
  } finally {
    await disabled.close();
  }
});

test('auth cookies: login sets an HttpOnly token + flag, the cookie authenticates, logout clears', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.9' };
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: ip,
    payload: { phone: '+48 600 700 800', password: 'secret-pass-1' }
  });
  assert.equal(login.statusCode, 200);

  const tokenCookie = login.cookies.find(c => c.name === 'token');
  const flagCookie = login.cookies.find(c => c.name === 'piramida.auth');
  assert.ok(tokenCookie, 'token cookie set');
  assert.equal(tokenCookie.httpOnly, true);
  assert.ok(flagCookie, 'readable flag cookie set');
  assert.notEqual(flagCookie.httpOnly, true);

  // The cookie alone (no Authorization header) authenticates
  const me = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: ip,
    cookies: { token: tokenCookie.value }
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().phone, '+48600700800');

  // Logout clears both cookies (expired Set-Cookie)
  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: ip });
  assert.equal(logout.statusCode, 200);
  const cleared = logout.cookies.find(c => c.name === 'token');
  assert.ok(cleared && (cleared.value === '' || cleared.maxAge === 0 || cleared.expires));
});

test('admin session cookie authenticates admin requests; bad token is rejected', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.10' };

  const bad = await app.inject({
    method: 'POST',
    url: '/api/admin/session',
    headers: ip,
    payload: { token: 'wrong-token' }
  });
  assert.equal(bad.statusCode, 401);

  const session = await app.inject({
    method: 'POST',
    url: '/api/admin/session',
    headers: ip,
    payload: { token: 'test-admin-token' }
  });
  assert.equal(session.statusCode, 200);
  const adminCookie = session.cookies.find(c => c.name === 'admin_token');
  assert.ok(adminCookie && adminCookie.httpOnly === true, 'HttpOnly admin cookie set');

  // The cookie authenticates an admin request without the x-admin-token header
  const stats = await app.inject({
    method: 'GET',
    url: '/api/admin/stats',
    headers: ip,
    cookies: { admin_token: adminCookie.value }
  });
  assert.equal(stats.statusCode, 200);
});

test('booking on a DST fall-back date computes correct Warsaw instants', async () => {
  // 2026-10-25 is the EU fall-back Sunday (25-hour day); 15:00 Warsaw is CET
  // (UTC+1) that afternoon, so the stored instant must be 14:00Z — not 13:00Z.
  const avail = await app.inject({ method: 'GET', url: '/api/availability?date=2026-10-25' });
  assert.equal(avail.statusCode, 200);
  assert.equal(avail.json().open, 15);
  assert.equal(avail.json().close, 23);

  const res = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: { 'x-forwarded-for': '198.51.100.8' },
    payload: {
      tableId: 1,
      date: '2026-10-25',
      startHour: 15,
      durationHours: 2,
      customerName: 'DST Guest',
      customerPhone: '+48512600600'
    }
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().startsAt, '2026-10-25T14:00:00.000Z');
  assert.equal(res.json().endsAt, '2026-10-25T16:00:00.000Z');
});
