import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, api, notFoundOn404, request } from '../src/lib/api';
import { rememberBooking } from '../src/lib/recent-bookings';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let respond: () => Response;

beforeEach(() => {
  calls = [];
  respond = () => Response.json({ ok: true });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  });
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const headersOf = (call: Call | undefined) => (call?.init.headers ?? {}) as Record<string, string>;

test('an error response becomes an ApiError with the status and the API code', async () => {
  respond = () => Response.json({ error: 'slot_taken' }, { status: 409 });
  const error = await request('/api/bookings', { method: 'POST', body: {} }).catch(e => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 409, code: 'slot_taken' });

  // A proxy's HTML error page still yields an ApiError, just without a code
  respond = () => new Response('<h1>Bad gateway</h1>', { status: 502 });
  expect(await request('/api/tables').catch(e => e)).toMatchObject({
    status: 502,
    code: 'unknown'
  });
});

test('JSON content-type only with a body, and always with credentials', async () => {
  await request('/api/tables');
  await request('/api/bookings', { method: 'POST', body: { a: 1 } });
  const [get, post] = calls;
  expect(headersOf(get)['content-type']).toBeUndefined();
  expect(get?.init.body).toBeUndefined();
  expect(headersOf(post)['content-type']).toBe('application/json');
  expect(post?.init.body).toBe('{"a":1}');
  expect(calls.every(call => call.init.credentials === 'include')).toBe(true);
});

test("a booking request carries this browser's secret for it, and only for it", async () => {
  rememberBooking('b-1', 'secret-1');
  rememberBooking('b-2');
  await api.booking('b-1');
  await api.booking('b-2');
  expect(headersOf(calls[0])['x-booking-token']).toBe('secret-1');
  expect(headersOf(calls[1])['x-booking-token']).toBeUndefined();
});

test('a booking id from the URL cannot walk to another endpoint', async () => {
  await api.booking('../admin/stats');
  expect(calls[0]?.url).toMatch(/\/api\/bookings\/\.\.%2Fadmin%2Fstats$/);
});

test('a 404 becomes the router not-found; anything else is rethrown as is', () => {
  const missing = new ApiError(404, 'not_found');
  const thrown = (() => {
    try {
      notFoundOn404(missing);
    } catch (e) {
      return e;
    }
  })();
  expect(thrown).not.toBe(missing);
  expect(thrown).toMatchObject({ isNotFound: true });

  const broken = new ApiError(500, 'internal_error');
  expect(() => notFoundOn404(broken)).toThrow(broken);
});
