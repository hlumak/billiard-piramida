import type {
  AdminAnalyticsDto,
  AdminCustomerDto,
  AdminMenuItemDto,
  MenuTranslationDto,
  AdminStatsDto,
  BookingDto,
  BookingStatus,
  IsoDate
} from '@repo/shared';
import { queryOptions } from '@tanstack/react-query';
import { hasFlagCookie, request } from './api';

export interface AdminCreateBookingInput {
  tableId: number;
  date: IsoDate;
  startHour: number;
  durationHours: number;
  customerName: string;
  customerPhone: string;
}

/** The admin token is an HttpOnly cookie; this readable flag cookie tells the
 *  client whether a staff session exists, for UI gating. */
const ADMIN_FLAG_COOKIE = 'piramida.admin';

export function isAdminSignedIn(): boolean {
  return hasFlagCookie(ADMIN_FLAG_COOKIE);
}

export interface AdminBookingFilters {
  date?: IsoDate | undefined;
  status?: BookingStatus | undefined;
  phone?: string | undefined;
}

export interface CustomerListParams {
  limit?: number | undefined;
  offset?: number | undefined;
  phone?: string | undefined;
}

export const adminApi = {
  // Exchange the token for an HttpOnly session cookie; the token is never stored
  // client-side. Subsequent calls authenticate via the cookie (credentials sent
  // by request()).
  session: (token: string) =>
    request<{ ok: boolean }>('/api/admin/session', { method: 'POST', body: { token } }),
  logout: () => request<{ ok: boolean }>('/api/admin/logout', { method: 'POST' }),
  stats: (signal?: AbortSignal) => request<AdminStatsDto>('/api/admin/stats', { signal }),
  bookings: (filters: AdminBookingFilters, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (filters.date) params.set('date', filters.date);
    if (filters.status) params.set('status', filters.status);
    if (filters.phone) params.set('phone', filters.phone);
    const query = params.size > 0 ? `?${params}` : '';
    return request<BookingDto[]>(`/api/admin/bookings${query}`, { signal });
  },
  customers: (params: CustomerListParams = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.phone) query.set('phone', params.phone);
    const suffix = query.toString();
    return request<AdminCustomerDto[]>(`/api/admin/customers${suffix ? `?${suffix}` : ''}`, {
      signal
    });
  },
  createBooking: (input: AdminCreateBookingInput) =>
    request<BookingDto>('/api/admin/bookings', { method: 'POST', body: input }),
  cancelBooking: (id: string) =>
    request<BookingDto>(`/api/admin/bookings/${id}/cancel`, { method: 'POST' }),
  analytics: (days: number, signal?: AbortSignal) =>
    request<AdminAnalyticsDto>(`/api/admin/analytics?days=${days}`, { signal }),
  menu: (signal?: AbortSignal) => request<AdminMenuItemDto[]>('/api/admin/menu', { signal }),
  createMenuItem: (input: {
    category: string;
    priceGrosz: number;
    translations: MenuTranslationDto[];
  }) => request<AdminMenuItemDto>('/api/admin/menu', { method: 'POST', body: input }),
  deleteMenuItem: (id: number) =>
    request<{ deleted: boolean }>(`/api/admin/menu/${id}`, { method: 'DELETE' }),
  updateMenuItem: (
    id: number,
    patch: {
      isAvailable?: boolean;
      priceGrosz?: number;
      category?: string;
      translations?: MenuTranslationDto[];
    }
  ) => request<AdminMenuItemDto>(`/api/admin/menu/${id}`, { method: 'PATCH', body: patch })
};

export const adminAnalyticsQuery = (days: number) =>
  queryOptions({
    queryKey: ['admin', 'analytics', days],
    queryFn: ({ signal }) => adminApi.analytics(days, signal),
    staleTime: 60_000
  });

export const adminMenuQuery = () =>
  queryOptions({
    queryKey: ['admin', 'menu'],
    queryFn: ({ signal }) => adminApi.menu(signal)
  });

export const adminStatsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'stats'],
    queryFn: ({ signal }) => adminApi.stats(signal),
    refetchInterval: 60_000
  });

export const adminBookingsQuery = (filters: AdminBookingFilters) =>
  queryOptions({
    // Every filter the queryFn reads must be in the key, or the phone search
    // reuses a stale cache entry and never refetches.
    queryKey: [
      'admin',
      'bookings',
      filters.date ?? null,
      filters.status ?? null,
      filters.phone ?? null
    ],
    queryFn: ({ signal }) => adminApi.bookings(filters, signal),
    refetchInterval: 60_000
  });

export const adminCustomersQuery = (params: CustomerListParams = {}) =>
  queryOptions({
    queryKey: [
      'admin',
      'customers',
      params.limit ?? null,
      params.offset ?? null,
      params.phone ?? null
    ],
    queryFn: ({ signal }) => adminApi.customers(params, signal)
  });
