import type {
  AdminAnalyticsDto,
  AdminCustomerDto,
  AdminMenuItemDto,
  AdminNewsItemDto,
  MenuTranslationDto,
  NewsTranslationDto,
  AdminStatsDto,
  AdminTournamentDto,
  AdminTournamentRegistrationDto,
  BookingDto,
  BilliardGame,
  BookingStatus,
  IsoDate,
  NewOrderItem,
  TournamentRegistrationStatus,
  TournamentStatus,
  TournamentTranslationDto,
  UploadedImageDto,
  VenueConfigDto
} from '@repo/shared';
import { queryOptions } from '@tanstack/react-query';
import { request, upload } from './api';
import { createFlagCookieStore } from './hydration';

export interface AdminCreateBookingInput {
  tableId: number;
  date: IsoDate;
  startHour: number;
  durationHours: number;
  customerName: string;
  customerPhone: string;
  sportCardCount?: number;
  /** Billiard only; the spot's default is stored when it is left out */
  game?: BilliardGame;
}

/**
 * Every field of a booking staff can correct after the fact. All optional: the
 * server holds whatever is left out, so "just make it two hours" is one key.
 */
export interface AdminBookingPatch {
  tableId?: number;
  date?: IsoDate;
  startHour?: number;
  durationHours?: number;
  customerName?: string;
  customerPhone?: string;
  sportCardCount?: number;
  game?: BilliardGame;
  status?: BookingStatus;
}

/** The admin token is an HttpOnly cookie; this readable flag cookie tells the
 *  client whether a staff session exists, for UI gating. */
const ADMIN_FLAG_COOKIE = 'piramida.admin';

export const adminAuthFlag = createFlagCookieStore(ADMIN_FLAG_COOKIE);

export interface AdminBookingFilters {
  date?: IsoDate | undefined;
  status?: BookingStatus | undefined;
  phone?: string | undefined;
}

/** A news card as the modal submits it — `null` clears the URL columns. */
export interface AdminNewsInput {
  /** Create only; omitted = derived from the Polish headline */
  slug?: string;
  imageUrl: string | null;
  linkUrl: string | null;
  sortOrder: number;
  translations: NewsTranslationDto[];
}

/** A tournament as the modal submits it — `null` clears an optional column. */
export interface AdminTournamentInput {
  status: TournamentStatus;
  startsOn: IsoDate | null;
  startHour: number | null;
  registrationDeadline: IsoDate | null;
  entryFeeGrosz: number | null;
  minPlayers: number;
  maxPlayers: number | null;
  imageUrl: string | null;
  translations: TournamentTranslationDto[];
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
  updateBooking: (id: string, patch: AdminBookingPatch) =>
    request<BookingDto>(`/api/admin/bookings/${id}`, { method: 'PATCH', body: patch }),
  addBookingItems: (id: string, items: NewOrderItem[]) =>
    request<BookingDto>(`/api/admin/bookings/${id}/items`, { method: 'POST', body: { items } }),
  setBookingItemQuantity: (id: string, itemId: string, quantity: number) =>
    request<BookingDto>(`/api/admin/bookings/${id}/items/${itemId}`, {
      method: 'PATCH',
      body: { quantity }
    }),
  removeBookingItem: (id: string, itemId: string) =>
    request<BookingDto>(`/api/admin/bookings/${id}/items/${itemId}`, { method: 'DELETE' }),
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
  ) => request<AdminMenuItemDto>(`/api/admin/menu/${id}`, { method: 'PATCH', body: patch }),
  news: (signal?: AbortSignal) => request<AdminNewsItemDto[]>('/api/admin/news', { signal }),
  createNewsItem: (input: AdminNewsInput) =>
    request<AdminNewsItemDto>('/api/admin/news', { method: 'POST', body: input }),
  updateNewsItem: (id: number, patch: Partial<AdminNewsInput> & { isPublished?: boolean }) =>
    request<AdminNewsItemDto>(`/api/admin/news/${id}`, { method: 'PATCH', body: patch }),
  deleteNewsItem: (id: number) =>
    request<{ deleted: boolean }>(`/api/admin/news/${id}`, { method: 'DELETE' }),
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return upload<UploadedImageDto>('/api/admin/images', form);
  },
  // Server-side: fetch the post page, take its og:image, store it like an upload
  importPostImage: (url: string) =>
    request<UploadedImageDto>('/api/admin/images/from-post', { method: 'POST', body: { url } }),
  venueConfig: (signal?: AbortSignal) =>
    request<VenueConfigDto>('/api/admin/venue-config', { signal }),
  saveVenueConfig: (config: VenueConfigDto) =>
    request<VenueConfigDto>('/api/admin/venue-config', { method: 'PUT', body: config }),
  tournaments: (signal?: AbortSignal) =>
    request<AdminTournamentDto[]>('/api/admin/tournaments', { signal }),
  createTournament: (input: AdminTournamentInput & { slug?: string }) =>
    request<AdminTournamentDto>('/api/admin/tournaments', { method: 'POST', body: input }),
  updateTournament: (id: number, patch: Partial<AdminTournamentInput>) =>
    request<AdminTournamentDto>(`/api/admin/tournaments/${id}`, { method: 'PATCH', body: patch }),
  deleteTournament: (id: number) =>
    request<{ deleted: boolean }>(`/api/admin/tournaments/${id}`, { method: 'DELETE' }),
  registrations: (tournamentId: number, signal?: AbortSignal) =>
    request<AdminTournamentRegistrationDto[]>(
      `/api/admin/tournaments/${tournamentId}/registrations`,
      { signal }
    ),
  addRegistration: (tournamentId: number, input: { name: string; phone: string }) =>
    request<AdminTournamentRegistrationDto>(
      `/api/admin/tournaments/${tournamentId}/registrations`,
      { method: 'POST', body: input }
    ),
  renameRegistration: (tournamentId: number, registrationId: string, name: string) =>
    request<AdminTournamentRegistrationDto>(
      `/api/admin/tournaments/${tournamentId}/registrations/${registrationId}`,
      { method: 'PATCH', body: { name } }
    ),
  setRegistrationStatus: (
    tournamentId: number,
    registrationId: string,
    status: TournamentRegistrationStatus
  ) =>
    request<AdminTournamentRegistrationDto>(
      `/api/admin/tournaments/${tournamentId}/registrations/${registrationId}`,
      { method: 'PATCH', body: { status } }
    ),
  deleteRegistration: (tournamentId: number, registrationId: string) =>
    request<{ deleted: boolean }>(
      `/api/admin/tournaments/${tournamentId}/registrations/${registrationId}`,
      { method: 'DELETE' }
    )
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

export const adminNewsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'news'],
    queryFn: ({ signal }) => adminApi.news(signal)
  });

export const adminVenueConfigQuery = () =>
  queryOptions({
    queryKey: ['admin', 'venue-config'],
    queryFn: ({ signal }) => adminApi.venueConfig(signal)
  });

export const adminTournamentsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'tournaments'],
    queryFn: ({ signal }) => adminApi.tournaments(signal)
  });

export const adminRegistrationsQuery = (tournamentId: number) =>
  queryOptions({
    queryKey: ['admin', 'tournaments', tournamentId, 'registrations'],
    queryFn: ({ signal }) => adminApi.registrations(tournamentId, signal)
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
