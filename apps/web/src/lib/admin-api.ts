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
import { request } from './api';

export interface AdminCreateBookingInput {
  tableId: number;
  date: IsoDate;
  startHour: number;
  durationHours: number;
  customerName: string;
  customerPhone: string;
}

const TOKEN_KEY = 'piramida.admin-token';

export function storedAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function storeAdminToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
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

function authHeaders(token: string): Record<string, string> {
  return { 'x-admin-token': token };
}

export const adminApi = {
  stats: (token: string, signal?: AbortSignal) =>
    request<AdminStatsDto>('/api/admin/stats', { headers: authHeaders(token), signal }),
  bookings: (token: string, filters: AdminBookingFilters, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (filters.date) params.set('date', filters.date);
    if (filters.status) params.set('status', filters.status);
    if (filters.phone) params.set('phone', filters.phone);
    const query = params.size > 0 ? `?${params}` : '';
    return request<BookingDto[]>(`/api/admin/bookings${query}`, {
      headers: authHeaders(token),
      signal
    });
  },
  customers: (token: string, params: CustomerListParams = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.phone) query.set('phone', params.phone);
    const suffix = query.toString();
    return request<AdminCustomerDto[]>(`/api/admin/customers${suffix ? `?${suffix}` : ''}`, {
      headers: authHeaders(token),
      signal
    });
  },
  createBooking: (token: string, input: AdminCreateBookingInput) =>
    request<BookingDto>('/api/admin/bookings', {
      method: 'POST',
      body: input,
      headers: authHeaders(token)
    }),
  cancelBooking: (token: string, id: string) =>
    request<BookingDto>(`/api/admin/bookings/${id}/cancel`, {
      method: 'POST',
      headers: authHeaders(token)
    }),
  analytics: (token: string, days: number, signal?: AbortSignal) =>
    request<AdminAnalyticsDto>(`/api/admin/analytics?days=${days}`, {
      headers: authHeaders(token),
      signal
    }),
  menu: (token: string, signal?: AbortSignal) =>
    request<AdminMenuItemDto[]>('/api/admin/menu', { headers: authHeaders(token), signal }),
  createMenuItem: (
    token: string,
    input: { category: string; priceGrosz: number; translations: MenuTranslationDto[] }
  ) =>
    request<AdminMenuItemDto>('/api/admin/menu', {
      method: 'POST',
      body: input,
      headers: authHeaders(token)
    }),
  deleteMenuItem: (token: string, id: number) =>
    request<{ deleted: boolean }>(`/api/admin/menu/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token)
    }),
  updateMenuItem: (
    token: string,
    id: number,
    patch: {
      isAvailable?: boolean;
      priceGrosz?: number;
      category?: string;
      translations?: MenuTranslationDto[];
    }
  ) =>
    request<AdminMenuItemDto>(`/api/admin/menu/${id}`, {
      method: 'PATCH',
      body: patch,
      headers: authHeaders(token)
    })
};

export const adminAnalyticsQuery = (token: string, days: number) =>
  queryOptions({
    queryKey: ['admin', 'analytics', days],
    queryFn: ({ signal }) => adminApi.analytics(token, days, signal),
    staleTime: 60_000
  });

export const adminMenuQuery = (token: string) =>
  queryOptions({
    queryKey: ['admin', 'menu'],
    queryFn: ({ signal }) => adminApi.menu(token, signal)
  });

export const adminStatsQuery = (token: string) =>
  queryOptions({
    queryKey: ['admin', 'stats'],
    queryFn: ({ signal }) => adminApi.stats(token, signal),
    refetchInterval: 60_000
  });

export const adminBookingsQuery = (token: string, filters: AdminBookingFilters) =>
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
    queryFn: ({ signal }) => adminApi.bookings(token, filters, signal),
    refetchInterval: 60_000
  });

export const adminCustomersQuery = (token: string, params: CustomerListParams = {}) =>
  queryOptions({
    queryKey: [
      'admin',
      'customers',
      params.limit ?? null,
      params.offset ?? null,
      params.phone ?? null
    ],
    queryFn: ({ signal }) => adminApi.customers(token, params, signal)
  });
