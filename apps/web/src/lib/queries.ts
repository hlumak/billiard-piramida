import { adoptTokenFromLocation } from './recent-bookings';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { BookingDto } from '@repo/shared';
import { api } from './api';

export const availabilityQuery = (date: string) =>
  queryOptions({
    queryKey: ['availability', date],
    queryFn: ({ signal }) => api.availability(date, signal),
    staleTime: 15_000,
    refetchInterval: 60_000
  });

/** The room's spots (billiard tables + dartboards) — venue config, rarely changes. */
export const tablesQuery = () =>
  queryOptions({
    queryKey: ['tables'],
    queryFn: ({ signal }) => api.tables(signal),
    staleTime: 60 * 60_000
  });

/**
 * Rates and opening hours. Loaded once in the root route so every screen can
 * read it synchronously from the cache; staff changes are rare, so it is stale
 * only briefly and never gates a decision the server does not re-check.
 */
export const venueConfigQuery = () =>
  queryOptions({
    queryKey: ['venue-config'],
    queryFn: ({ signal }) => api.venueConfig(signal),
    staleTime: 10 * 60_000
  });

export const menuQuery = (locale: string) =>
  queryOptions({
    queryKey: ['menu', locale],
    queryFn: ({ signal }) => api.menu(locale, signal),
    staleTime: 5 * 60_000
  });

/** Home-screen carousel — staff-authored, changes a few times a month. */
export const newsQuery = (locale: string) =>
  queryOptions({
    queryKey: ['news', locale],
    queryFn: ({ signal }) => api.news(locale, signal),
    staleTime: 5 * 60_000
  });

/** One news item's own page (/news/:slug). */
export const newsArticleQuery = (slug: string, locale: string) =>
  queryOptions({
    queryKey: ['news', 'article', slug, locale],
    queryFn: ({ signal }) => api.newsArticle(slug, locale, signal),
    staleTime: 5 * 60_000
  });

/** Tournament announcements. Shorter than news: the seat counter moves. */
export const tournamentsQuery = (locale: string) =>
  queryOptions({
    queryKey: ['tournaments', locale],
    queryFn: ({ signal }) => api.tournaments(locale, signal),
    staleTime: 60_000
  });

export const tournamentQuery = (slug: string, locale: string) =>
  queryOptions({
    queryKey: ['tournament', slug, locale],
    queryFn: ({ signal }) => api.tournament(slug, locale, signal),
    staleTime: 60_000
  });

/** What the signed-in account booked, on any device. */
export const MY_BOOKINGS_KEY = ['bookings', 'mine'] as const;

/**
 * A booking the guest just changed (cancelled, extended, ordered for): into
 * its own cache entry, and the account's list — which carries a copy of it —
 * refetched. Left alone, that list went on showing a cancelled booking as
 * upcoming on the My bookings page.
 */
export function storeChangedBooking(queryClient: QueryClient, booking: BookingDto): void {
  queryClient.setQueryData(bookingQuery(booking.id).queryKey, booking);
  void queryClient.invalidateQueries({ queryKey: MY_BOOKINGS_KEY });
}

export const bookingQuery = (id: string) =>
  queryOptions({
    queryKey: ['booking', id],
    queryFn: ({ signal }) => {
      // Opened from the booking's own link on this device: keep its secret
      adoptTokenFromLocation(id);
      return api.booking(id, signal);
    },
    staleTime: 30_000,
    // Poll only bookings that can still change; finished/cancelled are terminal
    refetchInterval: query => {
      const phase = query.state.data?.phase;
      return phase === 'upcoming' || phase === 'active' ? 60_000 : false;
    }
  });
