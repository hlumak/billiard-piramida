import type {
  AvailabilityDto,
  BookingDto,
  CreateBookingInput,
  MenuItemDto,
  NewOrderItem,
  TableDto
} from '@repo/shared';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

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
