import { useEffect, useState } from 'react';
import { Button, FieldError, Input, Label, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { CardFields, type CardsState } from '../components/profile/CardFields';
import { Reveal } from '../components/motion';
import { ApiError } from '../lib/api';
import {
  authApi,
  authToken,
  clearSession,
  profileQuery,
  storeSession,
  type RegisterInput
} from '../lib/auth';
import { formatPhone, isValidPhone } from '@repo/shared/phone';
import { noindexMeta } from '../lib/seo';
import { m } from '../paraglide/messages.js';

export const Route = createFileRoute('/profile')({
  head: () => ({ meta: noindexMeta('profile — piramida') }),
  component: ProfilePage
});

const EMPTY_CARDS: CardsState = { sportCardType: null, sportCardNumber: '', clubCardNumber: '' };

function ProfilePage() {
  // localStorage token is browser-only; decide after mount so SSR agrees
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => {
    setHasToken(authToken() !== null);
    setReady(true);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="profile" />
      <main className="mt-8 flex-1">
        {!ready ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : hasToken ? (
          <ProfileView onSignedOut={() => setHasToken(false)} />
        ) : (
          <AuthForms onSignedIn={() => setHasToken(true)} />
        )}
      </main>
    </div>
  );
}

function AuthForms({ onSignedIn }: { onSignedIn: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [cards, setCards] = useState<CardsState>(EMPTY_CARDS);

  const submit = useMutation({
    mutationFn: async () => {
      if (tab === 'login') return authApi.login(phone.trim(), password);
      const input: RegisterInput = {
        phone: phone.trim(),
        name: name.trim(),
        password,
        sportCardType: cards.sportCardType,
        sportCardNumber: cards.sportCardType !== null ? cards.sportCardNumber.trim() || null : null,
        clubCardNumber: cards.clubCardNumber.trim() || null
      };
      return authApi.register(input);
    },
    onSuccess: auth => {
      storeSession(queryClient, auth);
      onSignedIn();
    }
  });

  const errorText = submit.error
    ? submit.error instanceof ApiError && submit.error.code === 'phone_taken'
      ? m.auth_err_phone_taken()
      : submit.error instanceof ApiError && submit.error.code === 'invalid_phone'
        ? m.err_phone_invalid()
        : submit.error instanceof ApiError && submit.error.status === 401
          ? m.auth_err_invalid()
          : m.err_generic()
    : null;

  return (
    <Reveal className="mx-auto w-full max-w-sm md:max-w-md">
      <p className="mb-5 text-sm text-grey-cool">{m.auth_promo()}</p>

      <div role="tablist" className="mb-6 flex gap-2">
        {(['login', 'register'] as const).map(entry => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={tab === entry}
            onClick={() => {
              setTab(entry);
              submit.reset();
            }}
            className={`h-10 rounded-[10px] px-4 font-semibold transition-colors ${
              tab === entry
                ? 'bg-golden text-btn-text'
                : 'bg-club-green-light text-creme hover:bg-surface-hover'
            }`}
          >
            {entry === 'login' ? m.auth_tab_login() : m.auth_tab_register()}
          </button>
        ))}
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={event => {
          event.preventDefault();
          event.stopPropagation();
          submit.mutate();
        }}
      >
        {tab === 'register' ? (
          <TextField name="name" value={name} onChange={setName} isRequired>
            <Label>{m.name_label()}</Label>
            <Input placeholder={m.name_placeholder()} />
          </TextField>
        ) : null}

        <TextField
          name="phone"
          type="tel"
          value={phone}
          onChange={value => {
            setPhone(value);
            submit.reset();
          }}
          isRequired
        >
          <Label>{m.phone_label()}</Label>
          <Input placeholder={m.phone_placeholder()} />
        </TextField>

        <TextField
          name="password"
          type="password"
          value={password}
          onChange={value => {
            setPassword(value);
            submit.reset();
          }}
          isRequired
          isInvalid={errorText !== null}
          minLength={8}
        >
          <Label>{m.auth_password()}</Label>
          <Input autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />
          {errorText !== null ? (
            <FieldError>{errorText}</FieldError>
          ) : tab === 'register' ? (
            <p className="text-xs text-grey-cool">{m.auth_password_hint()}</p>
          ) : null}
        </TextField>

        {tab === 'register' ? <CardFields value={cards} onChange={setCards} /> : null}

        <Button
          type="submit"
          size="lg"
          className="h-[45px] w-full text-lg font-bold"
          isDisabled={!isValidPhone(phone) || password.length < 8}
          isPending={submit.isPending}
        >
          {tab === 'login' ? m.auth_tab_login() : m.auth_register_btn()}
        </Button>
      </form>
    </Reveal>
  );
}

function ProfileView({ onSignedOut }: { onSignedOut: () => void }) {
  const queryClient = useQueryClient();
  const { data: profile, isPending, isError } = useQuery(profileQuery());
  const [cards, setCards] = useState<CardsState | null>(null);

  useEffect(() => {
    if (profile && cards === null) {
      setCards({
        sportCardType: profile.sportCardType,
        sportCardNumber: profile.sportCardNumber ?? '',
        clubCardNumber: profile.clubCardNumber ?? ''
      });
    }
  }, [profile, cards]);

  const save = useMutation({
    mutationFn: (next: CardsState) =>
      authApi.update({
        sportCardType: next.sportCardType,
        sportCardNumber: next.sportCardType !== null ? next.sportCardNumber.trim() || null : null,
        clubCardNumber: next.clubCardNumber.trim() || null
      }),
    onSuccess: updated => {
      queryClient.setQueryData(profileQuery().queryKey, updated);
    }
  });

  const signOut = () => {
    clearSession(queryClient);
    onSignedOut();
  };

  // A dead/expired token would loop on 401 — treat it as signed out
  useEffect(() => {
    if (isError) signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

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
        <Button variant="ghost" size="sm" onPress={signOut}>
          {m.admin_logout()}
        </Button>
      </div>

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
          className="h-[45px] w-full text-lg font-bold"
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
