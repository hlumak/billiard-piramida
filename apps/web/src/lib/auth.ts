import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { AuthResponseDto, SportCardType, UserProfileDto } from '@repo/shared';
import { hasFlagCookie, request } from './api';

/** The session token is an HttpOnly cookie (unreadable by JS); this readable
 *  flag cookie tells the client whether a session exists, for UI gating. */
const USER_FLAG_COOKIE = 'piramida.auth';

export function isSignedIn(): boolean {
  return hasFlagCookie(USER_FLAG_COOKIE);
}

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

export function clearSession(queryClient: QueryClient): void {
  // Ask the server to clear the HttpOnly cookie + flag, then drop the cache
  void authApi.logout();
  queryClient.removeQueries({ queryKey: profileQuery().queryKey });
}
