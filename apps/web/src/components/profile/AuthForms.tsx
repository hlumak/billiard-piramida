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
import { useSubmitOnce } from '../../lib/use-submit-once';
import { useBotCheck } from '../../lib/bot-check';
import { BotCheckWidget } from '../BotCheckWidget';
import { m } from '../../paraglide/messages.js';

const EMPTY_CARDS: CardsState = { sportCardType: null, sportCardNumber: '' };
type AuthTab = 'login' | 'register';

/** What the guest typed: the login uses phone and password, registration all of it. */
interface AuthFields {
  phone: string;
  password: string;
  name: string;
  cards: CardsState;
}

function registerInput({ phone, password, name, cards }: AuthFields): RegisterInput {
  const hasCard = cards.sportCardType !== null;
  return {
    phone: phone.trim(),
    name: name.trim(),
    password,
    sportCardType: cards.sportCardType,
    sportCardNumber: hasCard ? cards.sportCardNumber.trim() || null : null
  };
}

/**
 * Where a failed submit is reported. A phone problem belongs on the phone
 * field, where it is read with the field; anything else goes under the
 * password, as "wrong phone or password" for a 401.
 */
function authErrors(error: Error | null): { phone: string | null; form: string | null } {
  if (error === null) return { phone: null, form: null };
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'phone_taken') return { phone: m.auth_err_phone_taken(), form: null };
  if (code === 'invalid_phone') return { phone: m.err_phone_invalid(), form: null };
  if (code === 'bot_check_failed') return { phone: null, form: m.err_bot_check() };
  const unauthorized = error instanceof ApiError && error.status === 401;
  return { phone: null, form: unauthorized ? m.auth_err_invalid() : m.err_generic() };
}

export function AuthForms({ onSignedIn }: { onSignedIn: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AuthTab>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [cards, setCards] = useState<CardsState>(EMPTY_CARDS);

  const once = useSubmitOnce();
  // Sign-up only: signing in is already limited per address and per number
  const botCheck = useBotCheck('register');
  const submit = useMutation({
    mutationFn: async () =>
      tab === 'login'
        ? authApi.login(phone.trim(), password)
        : authApi.register(registerInput({ phone, password, name, cards }), await botCheck.token()),
    onError: () => {
      once.release();
      // The token was spent on this attempt; the next one needs a fresh solve
      if (tab === 'register') botCheck.reset();
    },
    onSuccess: auth => {
      storeSession(queryClient, auth);
      onSignedIn();
    }
  });

  const { phone: phoneError, form: errorText } = authErrors(submit.error);

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
          if (once.claim()) submit.mutate();
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
        {tab === 'register' ? <BotCheckWidget check={botCheck} /> : null}

        <button
          type="submit"
          disabled={!isValidPhone(phone) || password.length < 8}
          // Not disabled while signing in: that would drop keyboard focus
          aria-disabled={submit.isPending || undefined}
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
