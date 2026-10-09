import type {
  AvailabilityDto,
  BookingDto,
  BookingSummaryDto,
  CreateBookingInput,
  CreatedBookingDto,
  MenuItemDto,
  NewOrderItem,
  NewsArticleDto,
  NewsItemDto,
  TableDto,
  TournamentDto,
  TournamentRegistrationInput,
  TournamentRegistrationResultDto,
  VenueConfigDto
} from '@repo/shared';
import { notFound } from '@tanstack/react-router';
import { manageTokenFor } from './recent-bookings';
import { currentRequestContext } from './request-context';

/**
 * API origin.
 *
 * Browser: VITE_API_URL, or — when unset, as in production — the page's own
 * origin (relative /api/… URLs through the reverse proxy), so the HttpOnly
 * session cookie rides along and no build ever bakes in a localhost URL.
 *
 * SSR: the web server must NOT fetch the public hostname — the request would
 * hairpin back through the proxy and hang. It reaches the API directly:
 * INTERNAL_API_URL (e.g. http://api:3001 between containers), else loopback
 * on API_PORT (default 3001).
 */
export const PUBLIC_API_URL: string = import.meta.env.VITE_API_URL ?? '';

function resolveApiUrl(): string {
  if (!import.meta.env.SSR) return PUBLIC_API_URL;

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.INTERNAL_API_URL || `http://127.0.0.1:${env?.API_PORT || 3001}`;
}

const API_URL: string = resolveApiUrl();

/**
 * SSR calls reach the API from loopback, so without this every visitor's
 * page render would share the single rate-limit bucket keyed on 127.0.0.1.
 * The server entry records the chain nginx built plus the hop that reached
 * this server; the API trusts loopback/private peers and walks it back to the
 * visitor. Always undefined in the browser.
 */
const forwardedFor = (): string | undefined => currentRequestContext()?.forwardedFor;

/** A render must not wait on a hung API for longer than nginx would. */
const REQUEST_TIMEOUT_MS = import.meta.env.SSR ? 3_000 : 15_000;

function withTimeout(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * Staff-uploaded pictures are stored as `/api/uploads/…` and served by the API.
 * Same-origin in production, but in dev the web app (:3000) and the API (:8080)
 * are different origins, so the path needs the API's PUBLIC origin in front —
 * public even during SSR, because this lands in an `<img src>` the browser
 * loads, not in a fetch the server makes.
 */
export function resolveAssetUrl(url: string): string {
  return url.startsWith('/api/') ? `${PUBLIC_API_URL}${url}` : url;
}

/** Non-sensitive flag cookie the server sets alongside the HttpOnly session
 *  cookie, so the client can gate its UI without ever reading the token. */
export function hasFlagCookie(name: string): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some(entry => entry.startsWith(`${name}=`));
}

/**
 * A loader's 404 as the router's notFound (a real HTTP 404 with the route's
 * not-found page), anything else rethrown to the error page. Used where a
 * missing record used to render a 200 with a spinner — a soft 404.
 */
export function notFoundOn404(error: unknown): never {
  if (error instanceof ApiError && error.status === 404) throw notFound();
  throw error;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`API ${status}: ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string | undefined;
  body?: unknown;
  headers?: Record<string, string> | undefined;
  /** TanStack Query passes this so unmounts/key changes abort in-flight fetches. */
  signal?: AbortSignal | undefined;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = 'unknown';
    try {
      const errorBody = (await response.json()) as { error?: string; message?: string };
      code = errorBody.error ?? errorBody.message ?? code;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, code);
  }
  return response.json() as Promise<T>;
}

export async function request<T>(
  path: string,
  { method, body, headers, signal }: RequestOptions = {}
): Promise<T> {
  const forwarded = forwardedFor();
  const response = await fetch(`${API_URL}${path}`, {
    ...(method !== undefined ? { method } : {}),
    signal: withTimeout(signal),
    // Send the HttpOnly session cookie (same-origin in prod, same-site in dev)
    credentials: 'include',
    headers: {
      ...headers,
      ...(forwarded !== undefined ? { 'x-forwarded-for': forwarded } : {}),
      // Fastify rejects an application/json content-type with an empty body
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return parseResponse<T>(response);
}

/** multipart POST — the browser sets the content-type (with its boundary) itself. */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    // Uploads are the slow path (5 MB on a phone connection): no short timeout
    credentials: 'include',
    body: form
  });
  return parseResponse<T>(response);
}

/**
 * The booking's secret (stored when it was made, or adopted from its link),
 * so the API lets this browser manage it. The id goes into the path encoded:
 * it arrives from the URL, and "../admin/…" must not become another endpoint.
 */
function bookingPath(id: string, suffix = ''): [string, Record<string, string>] {
  const token = manageTokenFor(id);
  return [
    `/api/bookings/${encodeURIComponent(id)}${suffix}`,
    token !== undefined ? { 'x-booking-token': token } : {}
  ];
}

export const api = {
  tables: (signal?: AbortSignal) => request<TableDto[]>('/api/tables', { signal }),
  availability: (date: string, signal?: AbortSignal) =>
    request<AvailabilityDto>(`/api/availability?date=${date}`, { signal }),
  venueConfig: (signal?: AbortSignal) => request<VenueConfigDto>('/api/venue-config', { signal }),
  menu: (locale: string, signal?: AbortSignal) =>
    request<MenuItemDto[]>(`/api/menu?locale=${locale}`, { signal }),
  news: (locale: string, signal?: AbortSignal) =>
    request<NewsItemDto[]>(`/api/news?locale=${locale}`, { signal }),
  newsArticle: (slug: string, locale: string, signal?: AbortSignal) =>
    request<NewsArticleDto>(`/api/news/${encodeURIComponent(slug)}?locale=${locale}`, { signal }),
  tournaments: (locale: string, signal?: AbortSignal) =>
    request<TournamentDto[]>(`/api/tournaments?locale=${locale}`, { signal }),
  tournament: (slug: string, locale: string, signal?: AbortSignal) =>
    request<TournamentDto>(`/api/tournaments/${encodeURIComponent(slug)}?locale=${locale}`, {
      signal
    }),
  // Holds a seat; the entry fee is still paid at the reception desk
  registerForTournament: (slug: string, locale: string, input: TournamentRegistrationInput) =>
    request<TournamentRegistrationResultDto>(
      `/api/tournaments/${encodeURIComponent(slug)}/register?locale=${locale}`,
      { method: 'POST', body: input }
    ),
  booking: (id: string, signal?: AbortSignal) => {
    const [path, headers] = bookingPath(id);
    return request<BookingDto>(path, { signal, headers });
  },
  /** Bookings the signed-in account made, manageable from any device. */
  myBookings: (signal?: AbortSignal) => request<BookingDto[]>('/api/bookings/mine', { signal }),
  lookupBookings: (phone: string, signal?: AbortSignal) =>
    request<BookingSummaryDto[]>(`/api/bookings/lookup?phone=${encodeURIComponent(phone)}`, {
      signal
    }),
  createBooking: (input: CreateBookingInput) =>
    request<CreatedBookingDto>('/api/bookings', { method: 'POST', body: input }),
  extendBooking: (id: string, additionalHours: number) => {
    const [path, headers] = bookingPath(id, '/extend');
    return request<BookingDto>(path, { method: 'POST', headers, body: { additionalHours } });
  },
  addItems: (id: string, items: NewOrderItem[]) => {
    const [path, headers] = bookingPath(id, '/items');
    return request<BookingDto>(path, { method: 'POST', headers, body: { items } });
  },
  cancelBooking: (id: string) => {
    const [path, headers] = bookingPath(id, '/cancel');
    return request<BookingDto>(path, { method: 'POST', headers });
  }
};
