import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { buildApp } from '../src/app.ts';
import { LOCAL_DATABASE_URL } from '../src/lib/config.ts';
import { createDb } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';

const ADMIN_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const TEST_URL = ADMIN_URL.replace(/\/[^/]+$/, '/piramida_test');

/** Next date (≥ 7 days out, so always in the future) falling on `weekday`. */
function nextDate(weekday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 7 + ((weekday - d.getDay() + 7) % 7));
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
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  await pool.end();
  await seed(TEST_URL);

  app = await buildApp({ databaseUrl: TEST_URL, logger: false, adminToken: 'test-admin-token' });
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

test('lists 5 tables', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/tables' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().length, 5);
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
  assert.equal(monBody.tables.length, 5);
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
  assert.equal(booking.tableTotalGrosz, 8000);
  assert.equal(booking.foodTotalGrosz, 2 * fries.priceGrosz);
  assert.equal(booking.totalGrosz, 8000 + 2 * fries.priceGrosz);
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
  assert.equal(extend.json().tableTotalGrosz, 12000);

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
  assert.equal(found.totalGrosz, 2 * 40_00 + 2 * found.items[0].unitPriceGrosz);

  const customers = await app.inject({ method: 'GET', url: '/api/admin/customers', headers });
  assert.equal(customers.statusCode, 200);
  const customer = customers.json().find((c: { phone: string }) => c.phone === '+48 700 800 900');
  assert.ok(customer);
  assert.equal(customer.name, 'Admin Test');
  assert.ok(customer.bookingsCount >= 1);
  assert.ok(customer.totalSpentGrosz > 0);
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
