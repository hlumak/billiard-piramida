import { useId, useState } from 'react';
import { FieldError, Input, Label, TextField } from '@heroui/react';
import { LoaderCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isValidPhone } from '@repo/shared/phone';
import { CardFields, type CardsState } from './CardFields';
import { PhoneField } from '../PhoneField';
import { TabList } from '../TabList';
import { tabId, tabPanelId } from '../tab-ids';
import { ApiError } from '../../lib/api';
import { authApi, storeSession, type RegisterInput } from '../../lib/auth';
import { m } from '../../paraglide/messages.js';

const EMPTY_CARDS: CardsState = { sportCardType: null, sportCardNumber: '' };
type AuthTab = 'login' | 'register';

export function AuthForms({ onSignedIn }: { onSignedIn: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AuthTab>('login');
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
        sportCardNumber: cards.sportCardType !== null ? cards.sportCardNumber.trim() || null : null
      };
      return authApi.register(input);
    },
    onSuccess: auth => {
      storeSession(queryClient, auth);
      onSignedIn();
    }
  });

  // A phone problem belongs on the phone field, where it is read with the field
  const error = submit.error instanceof ApiError ? submit.error : null;
  const phoneError =
    error?.code === 'phone_taken'
      ? m.auth_err_phone_taken()
      : error?.code === 'invalid_phone'
        ? m.err_phone_invalid()
        : null;
  const errorText =
    submit.error === null || phoneError !== null
      ? null
      : error?.status === 401
        ? m.auth_err_invalid()
        : m.err_generic();

  const idBase = useId();
  const selectTab = (entry: AuthTab) => {
    setTab(entry);
    submit.reset();
  };

  return (
    <div className="card rounded-3xl p-5 md:p-7">
      <TabList
        idBase={idBase}
        tabs={[
          { id: 'login', label: m.auth_tab_login() },
          { id: 'register', label: m.auth_tab_register() }
        ]}
        selected={tab}
        onSelect={selectTab}
        className="grid grid-cols-2 gap-1 rounded-[14px] bg-club-green-dark p-1.25"
        tabClassName="segment h-11 text-[15px]"
      />

      <form
        id={tabPanelId(idBase)}
        role="tabpanel"
        aria-labelledby={tabId(idBase, tab)}
        className="fields-roomy mt-6 flex flex-col gap-4.5"
        onSubmit={event => {
          event.preventDefault();
          event.stopPropagation();
          submit.mutate();
        }}
      >
        {tab === 'register' ? (
          <TextField name="name" value={name} onChange={setName} isRequired>
            <Label>{m.name_full_label()}</Label>
            <Input placeholder={m.name_full_placeholder()} autoComplete="name" />
          </TextField>
        ) : null}

        <PhoneField
          name="phone"
          value={phone}
          onChange={value => {
            setPhone(value);
            submit.reset();
          }}
          isRequired
          isInvalid={phoneError !== null}
          errorMessage={phoneError ?? undefined}
        />

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

        <button
          type="submit"
          disabled={!isValidPhone(phone) || password.length < 8 || submit.isPending}
          aria-busy={submit.isPending}
          className="btn-gold mt-1.5 h-14 w-full text-base"
        >
          {submit.isPending ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : null}
          {tab === 'login' ? m.auth_tab_login() : m.auth_register_btn()}
        </button>
      </form>
    </div>
  );
}
