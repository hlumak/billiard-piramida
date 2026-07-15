import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

export const availabilityQuery = (date: string) =>
  queryOptions({
    queryKey: ['availability', date],
    queryFn: ({ signal }) => api.availability(date, signal),
    staleTime: 15_000,
    refetchInterval: 60_000
  });

export const menuQuery = (locale: string) =>
  queryOptions({
    queryKey: ['menu', locale],
    queryFn: ({ signal }) => api.menu(locale, signal),
    staleTime: 5 * 60_000
  });

export const bookingQuery = (id: string) =>
  queryOptions({
    queryKey: ['booking', id],
    queryFn: ({ signal }) => api.booking(id, signal),
    staleTime: 30_000,
    // Poll only bookings that can still change; finished/cancelled are terminal
    refetchInterval: query => {
      const phase = query.state.data?.phase;
      return phase === 'upcoming' || phase === 'active' ? 60_000 : false;
    }
  });
