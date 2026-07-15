import type {
  AdminCustomerDto,
  AdminStatsDto,
  BookingDto,
  BookingStatus,
  IsoDate
} from '@repo/shared';
import { queryOptions } from '@tanstack/react-query';
import { request } from './api';

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
    const query = params.size > 0 ? `?${params}` : '';
    return request<BookingDto[]>(`/api/admin/bookings${query}`, {
      headers: authHeaders(token),
      signal
    });
  },
  customers: (token: string, signal?: AbortSignal) =>
    request<AdminCustomerDto[]>('/api/admin/customers', { headers: authHeaders(token), signal })
};

export const adminStatsQuery = (token: string) =>
  queryOptions({
    queryKey: ['admin', 'stats'],
    queryFn: ({ signal }) => adminApi.stats(token, signal),
    refetchInterval: 60_000
  });

export const adminBookingsQuery = (token: string, filters: AdminBookingFilters) =>
  queryOptions({
    queryKey: ['admin', 'bookings', filters.date ?? null, filters.status ?? null],
    queryFn: ({ signal }) => adminApi.bookings(token, filters, signal),
    refetchInterval: 60_000
  });

export const adminCustomersQuery = (token: string) =>
  queryOptions({
    queryKey: ['admin', 'customers'],
    queryFn: ({ signal }) => adminApi.customers(token, signal)
  });
