import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { AuthResponseDto, SportCardType, UserProfileDto } from '@repo/shared';
import { hasFlagCookie, request } from './api';
import { createFlagCookieStore } from './hydration';

/** The session token is an HttpOnly cookie (unreadable by JS); this readable
 *  flag cookie tells the client whether a session exists, for UI gating. */
const USER_FLAG_COOKIE = 'piramida.auth';

export function isSignedIn(): boolean {
  return hasFlagCookie(USER_FLAG_COOKIE);
}

export const userAuthFlag = createFlagCookieStore(USER_FLAG_COOKIE);

export interface RegisterInput {
  phone: string;
  name: string;
  password: string;
  sportCardType?: SportCardType | null;
  sportCardNumber?: string | null;
  clubCardNumber?: string | null;
}

export interface ProfileUpdateInput {
  name?: string;
  sportCardType?: SportCardType | null;
  sportCardNumber?: string | null;
  clubCardNumber?: string | null;
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<AuthResponseDto>('/api/auth/register', { method: 'POST', body: input }),
  login: (phone: string, password: string) =>
    request<AuthResponseDto>('/api/auth/login', { method: 'POST', body: { phone, password } }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: (signal?: AbortSignal) => request<UserProfileDto>('/api/auth/me', { signal }),
  update: (input: ProfileUpdateInput) =>
    request<UserProfileDto>('/api/auth/me', { method: 'PATCH', body: input })
};

export const profileQuery = () =>
  queryOptions({
    queryKey: ['me'],
    queryFn: ({ signal }) => authApi.me(signal),
    staleTime: 5 * 60_000,
    retry: false,
    enabled: isSignedIn()
  });

export function storeSession(queryClient: QueryClient, auth: AuthResponseDto): void {
  // The session cookie was set by the server response; just seed the profile cache
  queryClient.setQueryData(profileQuery().queryKey, auth.profile);
}

/**
 * Sign out for real: only the server can clear the HttpOnly session cookie, so
 * this waits for it and rejects if it failed — the session is then still alive
 * and the UI must not claim otherwise (a shared device would stay signed in).
 */
export async function clearSession(queryClient: QueryClient): Promise<void> {
  await authApi.logout();
  dropSessionData(queryClient);
}

/** Forget everything cached for the signed-in account. */
export function dropSessionData(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: profileQuery().queryKey });
  queryClient.removeQueries({ queryKey: ['bookings', 'mine'] });
}
