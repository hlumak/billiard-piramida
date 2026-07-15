import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { AuthResponseDto, SportCardType, UserProfileDto } from '@repo/shared';
import { authToken, persistAuthToken, request } from './api';

export { authToken };

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
    enabled: authToken() !== null
  });

export function storeSession(queryClient: QueryClient, auth: AuthResponseDto): void {
  persistAuthToken(auth.token);
  queryClient.setQueryData(profileQuery().queryKey, auth.profile);
}

export function clearSession(queryClient: QueryClient): void {
  persistAuthToken(null);
  queryClient.removeQueries({ queryKey: profileQuery().queryKey });
}
