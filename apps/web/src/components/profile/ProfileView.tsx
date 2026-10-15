import { useEffect, useState } from 'react';
import { Spinner } from '@heroui/react';
import { ChevronRight, LoaderCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatPhone } from '@repo/shared/phone';
import { CardFields, type CardsState } from './CardFields';
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
  if (error && !isAuthError) return <QueryError error={error} onRetry={() => refetch()} />;

  if (isPending || !profile || cards === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  return (
    <div className="anim-reveal mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <section className="card flex items-center gap-4 p-5 md:p-6">
        <span
          aria-hidden
          className="flex size-14 flex-none items-center justify-center rounded-full bg-golden text-2xl font-bold text-btn-text"
        >
          {profile.name.trim().charAt(0).toLocaleUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold">
            {m.profile_welcome({ name: profile.name })}
          </h2>
          <p className="mt-0.5 text-sm text-grey-cool">{formatPhone(profile.phone)}</p>
        </div>
        <button
          type="button"
          // Not disabled while signing out: that would drop keyboard focus
          aria-disabled={signOut.isPending || undefined}
          onClick={() => {
            if (!signOut.isPending) signOut.mutate();
          }}
          className="btn-outline h-10 flex-none px-4 text-sm"
        >
          {m.admin_logout()}
        </button>
      </section>
      {signOut.isError ? (
        <p role="alert" className="text-sm text-danger-soft-foreground">
          {m.err_signout_failed()}
        </p>
      ) : null}

      <Link to="/bookings" className="card lift flex items-center justify-between gap-4 p-5 md:p-6">
        <span className="text-[17px] font-bold">{m.nav_my_bookings()}</span>
        <ChevronRight aria-hidden className="size-5 text-golden" />
      </Link>

      <form
        className="card fields-roomy flex flex-col gap-4.5 p-5 md:p-6"
        onSubmit={event => {
          event.preventDefault();
          event.stopPropagation();
          if (!save.isPending) save.mutate(cards);
        }}
      >
        <h2 className="text-lg font-bold text-golden-light">{m.profile_cards_title()}</h2>
        <CardFields
          value={cards}
          onChange={next => {
            setCards(next);
            save.reset();
          }}
        />
        <button
          type="submit"
          aria-disabled={save.isPending || undefined}
          aria-busy={save.isPending}
          className="btn-gold h-13 w-full text-base"
        >
          {save.isPending ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : null}
          {save.isSuccess ? m.saved_ok() : m.btn_save()}
        </button>
        {save.isError ? (
          <p className="text-sm text-danger-soft-foreground">{m.err_generic()}</p>
        ) : null}
      </form>
    </div>
  );
}
