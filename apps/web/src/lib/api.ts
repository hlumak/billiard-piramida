import type {
  AvailabilityDto,
  BookingDto,
  CreateBookingInput,
  MenuItemDto,
  NewOrderItem,
  TableDto
} from '@repo/shared';

/**
 * API origin.
 *
 * Browser: call our own public origin (VITE_API_URL — same-origin in prod) so
 * the HttpOnly session cookie rides along.
 *
 * SSR: the web server must NOT fetch that public hostname. The request would
 * hairpin back through nginx to this same host and hang, 504-ing every route
 * with an SSR loader (/prices, /booking/$id). Reach the API directly over
 * loopback instead. API_PORT rides in the same .env the prod server loads
 * (--env-file), so this needs no extra config; INTERNAL_API_URL is an explicit
 * override for other topologies. In dev (`vite dev`, no --env-file) neither is
 * set, so SSR falls back to the public URL and behaves as before.
 */
function resolveApiUrl(): string {
  const publicUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
  if (!import.meta.env.SSR) return publicUrl;

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const internalUrl =
    env?.INTERNAL_API_URL ?? (env?.API_PORT ? `http://127.0.0.1:${env.API_PORT}` : undefined);
  return internalUrl ?? publicUrl;
}

const API_URL: string = resolveApiUrl();

/** Non-sensitive flag cookie the server sets alongside the HttpOnly session
 *  cookie, so the client can gate its UI without ever reading the token. */
export function hasFlagCookie(name: string): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some(entry => entry.startsWith(`${name}=`));
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

export async function request<T>(
  path: string,
  { method, body, headers, signal }: RequestOptions = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...(method !== undefined ? { method } : {}),
    signal: signal ?? null,
    // Send the HttpOnly session cookie (same-origin in prod, same-site in dev)
    credentials: 'include',
    headers: {
      ...headers,
      // Fastify rejects an application/json content-type with an empty body
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
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

export const api = {
  tables: (signal?: AbortSignal) => request<TableDto[]>('/api/tables', { signal }),
  availability: (date: string, signal?: AbortSignal) =>
    request<AvailabilityDto>(`/api/availability?date=${date}`, { signal }),
  menu: (locale: string, signal?: AbortSignal) =>
    request<MenuItemDto[]>(`/api/menu?locale=${locale}`, { signal }),
  booking: (id: string, signal?: AbortSignal) =>
    request<BookingDto>(`/api/bookings/${id}`, { signal }),
  lookupBookings: (phone: string, signal?: AbortSignal) =>
    request<BookingDto[]>(`/api/bookings/lookup?phone=${encodeURIComponent(phone)}`, { signal }),
  createBooking: (input: CreateBookingInput) =>
    request<BookingDto>('/api/bookings', { method: 'POST', body: input }),
  extendBooking: (id: string, additionalHours: number) =>
    request<BookingDto>(`/api/bookings/${id}/extend`, {
      method: 'POST',
      body: { additionalHours }
    }),
  addItems: (id: string, items: NewOrderItem[]) =>
    request<BookingDto>(`/api/bookings/${id}/items`, { method: 'POST', body: { items } }),
  cancelBooking: (id: string) =>
    request<BookingDto>(`/api/bookings/${id}/cancel`, { method: 'POST' })
};
