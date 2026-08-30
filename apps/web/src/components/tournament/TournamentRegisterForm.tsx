import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import type { TournamentDto } from '@repo/shared';
import { isValidPhone } from '@repo/shared/phone';
import { ApiError, api } from '../../lib/api';
import { profileQuery } from '../../lib/auth';
import { tournamentQuery, tournamentsQuery } from '../../lib/queries';
import { PhoneField } from '../PhoneField';
import { m } from '../../paraglide/messages.js';
import { getLocale } from '../../paraglide/runtime.js';

/** Server-side refusals a visitor can understand; anything else is a generic failure. */
function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return m.err_generic();
  switch (error.code) {
    case 'already_registered':
      return m.tournament_err_already();
    case 'tournament_full':
      return m.tournament_err_full();
    case 'registration_closed':
      return m.tournament_err_closed();
    case 'invalid_phone':
      return m.err_phone_invalid();
    default:
      return m.err_generic();
  }
}

/**
 * Holds a seat on the roster. No payment happens here by design — the club
 * takes the entry fee at the reception desk, and staff flip the sign-up to
 * confirmed once it is paid, which is what the hint below the button says.
 */
export function TournamentRegisterForm({ tournament }: { tournament: TournamentDto }) {
  const queryClient = useQueryClient();
  const locale = getLocale();
  const { data: profile } = useQuery(profileQuery());

  const register = useMutation({
    mutationFn: (value: { name: string; phone: string }) =>
      api.registerForTournament(tournament.slug, locale, value),
    onSuccess: result => {
      // The response carries the tournament with its counters already updated,
      // so the meter moves without a refetch; the list page still needs one.
      queryClient.setQueryData(
        tournamentQuery(tournament.slug, locale).queryKey,
        result.tournament
      );
      queryClient.invalidateQueries({ queryKey: tournamentsQuery(locale).queryKey });
    }
  });

  const form = useForm({
    defaultValues: { name: profile?.name ?? '', phone: profile?.phone ?? '' },
    onSubmit: ({ value }) => {
      register.mutate({ name: value.name.trim(), phone: value.phone.trim() });
    }
  });

  if (register.isSuccess) {
    return (
      <div className="rounded-[10px] bg-club-green-light p-4" role="status">
        <p className="flex items-center gap-2 font-semibold text-golden">
          <CheckCircle2 className="size-5 shrink-0" />
          {m.tournament_registered_title()}
        </p>
        <p className="mt-2 text-sm text-creme/85">{m.tournament_registered_hint()}</p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-[10px] bg-club-green-light p-4"
      onSubmit={event => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <h3 className="font-semibold text-golden">{m.tournament_register_title()}</h3>

      <form.Field
        name="name"
        validators={{ onSubmit: ({ value }) => (value.trim() ? undefined : m.err_name_required()) }}
      >
        {field => (
          <TextField
            name={field.name}
            value={field.state.value}
            onChange={value => {
              // A stale server error left on the field keeps HeroUI in the
              // invalid state and blocks the next submit — clear it on edit.
              register.reset();
              field.handleChange(value);
            }}
            isInvalid={field.state.meta.errors.length > 0}
          >
            <Label>{m.name_label()}</Label>
            <Input placeholder={m.name_placeholder()} onBlur={field.handleBlur} />
            <FieldError>{field.state.meta.errors[0]}</FieldError>
          </TextField>
        )}
      </form.Field>

      <form.Field
        name="phone"
        validators={{
          onSubmit: ({ value }) => (isValidPhone(value) ? undefined : m.err_phone_invalid())
        }}
      >
        {field => (
          <PhoneField
            name={field.name}
            value={field.state.value}
            onChange={value => {
              register.reset();
              field.handleChange(value);
            }}
            onBlur={field.handleBlur}
            isInvalid={field.state.meta.errors.length > 0}
            errorMessage={field.state.meta.errors[0]}
          />
        )}
      </form.Field>

      {register.isError ? (
        <p className="rounded-[10px] bg-danger-soft p-3 text-sm text-creme" role="alert">
          {errorMessage(register.error)}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="h-11.25 w-full text-lg font-bold"
        isPending={register.isPending}
      >
        {register.isPending ? m.tournament_registering() : m.tournament_register_btn()}
      </Button>
      <p className="text-xs text-grey-cool">{m.tournament_fee_hint()}</p>
    </form>
  );
}
