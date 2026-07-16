import type {
  AvailabilityDto,
  BookingDto,
  CreateBookingInput,
  MenuItemDto,
  NewOrderItem,
  TableDto
} from '@repo/shared';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

const TOKEN_KEY = 'piramida.token';

/** Optional-auth session token (null for guests / during SSR). */
export function authToken(): string | null {
  if (typeof window === 'undefined') return null;
  // localStorage access throws in storage-blocked contexts (Safari private
  // mode, disabled cookies) — a guest without a token must not crash the app.
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function persistAuthToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked — the session simply won't persist across reloads */
  }
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
  const token = authToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...(method !== undefined ? { method } : {}),
    signal: signal ?? null,
    headers: {
      // Signed-in clients get discounts on booking creation; harmless elsewhere
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
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
