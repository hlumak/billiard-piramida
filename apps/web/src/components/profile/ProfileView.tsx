import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatPhone } from '@repo/shared/phone';
import { CardFields, type CardsState } from './CardFields';
import { Reveal } from '../motion';
import { QueryError } from '../QueryError';
import { ApiError } from '../../lib/api';
import { authApi, clearSession, dropSessionData, profileQuery } from '../../lib/auth';
import { m } from '../../paraglide/messages.js';

export function ProfileView({ onSignedOut }: { onSignedOut: () => void }) {
  const queryClient = useQueryClient();
  const { data: profile, isPending, error, refetch } = useQuery(profileQuery());
  const [cards, setCards] = useState<CardsState | null>(null);
  // Only an auth failure means the token is dead; a network blip / 5xx must not
  // silently sign the user out and delete their token.
  const isAuthError = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (profile && cards === null) {
      setCards({
        sportCardType: profile.sportCardType,
        sportCardNumber: profile.sportCardNumber ?? ''
      });
    }
  }, [profile, cards]);

  const save = useMutation({
    mutationFn: (next: CardsState) =>
      authApi.update({
        sportCardType: next.sportCardType,
        sportCardNumber: next.sportCardType !== null ? next.sportCardNumber.trim() || null : null
      }),
    onSuccess: updated => {
      queryClient.setQueryData(profileQuery().queryKey, updated);
    }
  });

  const signOut = useMutation({
    mutationFn: () => clearSession(queryClient),
    onSuccess: onSignedOut
  });

  // A dead/expired token (401) would loop — treat it as signed out. The
  // server is still asked to clear its cookies, but the session is already
  // worthless, so the UI doesn't wait on that.
  useEffect(() => {
    if (!isAuthError) return;
    void authApi.logout().catch(() => undefined);
    dropSessionData(queryClient);
    onSignedOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthError]);

  // Non-auth failure: keep the session, offer a retry instead of signing out
  if (error && !isAuthError) return <QueryError onRetry={() => refetch()} />;

  if (isPending || !profile || cards === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  return (
    <Reveal className="mx-auto w-full max-w-sm md:max-w-md">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-creme">
            {m.profile_welcome({ name: profile.name })}
          </h2>
          <p className="text-sm text-grey-cool">{formatPhone(profile.phone)}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          isPending={signOut.isPending}
          onPress={() => signOut.mutate()}
        >
          {m.admin_logout()}
        </Button>
      </div>
      {signOut.isError ? (
        <p role="alert" className="-mt-4 mb-4 text-sm text-danger-soft-foreground">
          {m.err_signout_failed()}
        </p>
      ) : null}

      <Link to="/bookings" className="mb-6 block font-semibold text-golden hover:underline">
        {m.nav_my_bookings()} →
      </Link>

      <h3 className="mb-3 font-semibold text-golden">{m.profile_cards_title()}</h3>
      <form
        className="flex flex-col gap-4"
        onSubmit={event => {
          event.preventDefault();
          event.stopPropagation();
          save.mutate(cards);
        }}
      >
        <CardFields
          value={cards}
          onChange={next => {
            setCards(next);
            save.reset();
          }}
        />
        <Button
          type="submit"
          size="lg"
          className="h-11.25 w-full text-lg font-bold"
          isPending={save.isPending}
        >
          {save.isSuccess ? m.saved_ok() : m.btn_save()}
        </Button>
        {save.isError ? (
          <p className="text-sm text-danger-soft-foreground">{m.err_generic()}</p>
        ) : null}
      </form>
    </Reveal>
  );
}
