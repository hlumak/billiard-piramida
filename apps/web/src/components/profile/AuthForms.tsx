import { useState } from 'react';
import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isValidPhone } from '@repo/shared/phone';
import { CardFields, type CardsState } from './CardFields';
import { Reveal } from '../motion';
import { ApiError } from '../../lib/api';
import { authApi, storeSession, type RegisterInput } from '../../lib/auth';
import { m } from '../../paraglide/messages.js';

const EMPTY_CARDS: CardsState = { sportCardType: null, sportCardNumber: '', clubCardNumber: '' };

export function AuthForms({ onSignedIn }: { onSignedIn: () => void }) {
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
          className="h-11.25 w-full text-lg font-bold"
          isDisabled={!isValidPhone(phone) || password.length < 8}
          isPending={submit.isPending}
        >
          {tab === 'login' ? m.auth_tab_login() : m.auth_register_btn()}
        </Button>
      </form>
    </Reveal>
  );
}
