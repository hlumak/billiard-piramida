import { useState } from 'react';
import { Button, Input, Label, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminTournamentRegistrationDto, TournamentRegistrationStatus } from '@repo/shared';
import { formatPhone, isValidPhone } from '@repo/shared/phone';
import { adminApi, adminRegistrationsQuery } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';

function statusLabel(status: TournamentRegistrationStatus): string {
  switch (status) {
    case 'pending':
      return m.admin_registration_pending();
    case 'confirmed':
      return m.admin_registration_confirmed();
    case 'cancelled':
      return m.admin_registration_cancelled();
  }
}

function RosterRow({
  registration,
  onSetStatus,
  onRename,
  onRemove,
  isBusy
}: {
  registration: AdminTournamentRegistrationDto;
  onSetStatus: (status: TournamentRegistrationStatus) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  isBusy: boolean;
}) {
  const { status } = registration;
  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-[10px] bg-club-green p-3 ${
        status === 'cancelled' ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-creme">{registration.name}</p>
        <p className="text-xs text-grey-cool">
          {formatPhone(registration.phone)} · {statusLabel(status)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === 'pending' ? (
          <Button size="sm" isPending={isBusy} onPress={() => onSetStatus('confirmed')}>
            {m.admin_registration_confirm()}
          </Button>
        ) : null}
        {/* Names come in over the phone and get misheard */}
        <Button
          size="sm"
          variant="ghost"
          isPending={isBusy}
          onPress={() => {
            const next = window.prompt(m.admin_registration_rename(), registration.name);
            if (next !== null && next.trim() !== '') onRename(next.trim());
          }}
        >
          {m.admin_registration_rename()}
        </Button>
        {status === 'cancelled' ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              isPending={isBusy}
              onPress={() => onSetStatus('pending')}
            >
              {m.admin_registration_restore()}
            </Button>
            {/* Only offered once a seat is already released: cancelling is the
                reversible action, this is the one that drops the record. */}
            <Button
              size="sm"
              variant="danger-soft"
              isPending={isBusy}
              onPress={() => {
                if (window.confirm(m.admin_registration_remove_confirm())) onRemove();
              }}
            >
              {m.admin_registration_remove()}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="danger-soft"
            isPending={isBusy}
            onPress={() => onSetStatus('cancelled')}
          >
            {m.admin_registration_cancel()}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * The roster behind one tournament. Cancelling rather than deleting is the
 * default action: a cancelled seat frees its place in the counters but leaves
 * the record of who had it.
 */
export function AdminTournamentRoster({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const {
    data: roster,
    isPending,
    isError,
    refetch
  } = useQuery(adminRegistrationsQuery(tournamentId));

  // Seat counts live on the tournament DTOs, so every roster write invalidates
  // the staff list and the storefront alongside the roster itself.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
    queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    queryClient.invalidateQueries({ queryKey: ['tournament'] });
  };

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TournamentRegistrationStatus }) =>
      adminApi.setRegistrationStatus(tournamentId, id, status),
    onSuccess: invalidate
  });

  const rename = useMutation({
    mutationFn: ({ id, name: next }: { id: string; name: string }) =>
      adminApi.renameRegistration(tournamentId, id, next),
    onSuccess: invalidate
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteRegistration(tournamentId, id),
    onSuccess: invalidate
  });

  const add = useMutation({
    mutationFn: () => adminApi.addRegistration(tournamentId, { name: name.trim(), phone }),
    onSuccess: () => {
      setName('');
      setPhone('');
      invalidate();
    }
  });

  const canAdd = name.trim() !== '' && isValidPhone(phone);
  const addError =
    add.error instanceof ApiError && add.error.code === 'already_registered'
      ? m.admin_registration_taken()
      : add.isError
        ? m.err_generic()
        : null;

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !roster) {
    return (
      <div className="flex justify-center py-6">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-deep-cream/20 pt-3">
      <p className="text-sm font-semibold text-golden">{m.admin_roster()}</p>

      {roster.length === 0 ? (
        <p className="text-sm text-grey-cool">{m.admin_roster_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {roster.map(registration => (
            <RosterRow
              key={registration.id}
              registration={registration}
              isBusy={
                (setStatus.isPending && setStatus.variables?.id === registration.id) ||
                (rename.isPending && rename.variables?.id === registration.id) ||
                (remove.isPending && remove.variables === registration.id)
              }
              onSetStatus={status => setStatus.mutate({ id: registration.id, status })}
              onRename={name => rename.mutate({ id: registration.id, name })}
              onRemove={() => remove.mutate(registration.id)}
            />
          ))}
        </ul>
      )}

      {/* Walk-ins: staff take the fee at the desk and add the player themselves,
          so this bypasses the deadline and the cap the public form respects. */}
      <div className="flex flex-wrap items-end gap-2">
        <TextField name="rosterName" value={name} onChange={setName} className="min-w-40 flex-1">
          <Label>{m.name_label()}</Label>
          <Input placeholder={m.name_placeholder()} />
        </TextField>
        <TextField
          name="rosterPhone"
          type="tel"
          value={phone}
          onChange={setPhone}
          className="min-w-40 flex-1"
        >
          <Label>{m.phone_label()}</Label>
          <Input placeholder={m.phone_placeholder()} />
        </TextField>
        <Button
          size="sm"
          className="h-10"
          isDisabled={!canAdd}
          isPending={add.isPending}
          onPress={() => add.mutate()}
        >
          {m.admin_roster_add()}
        </Button>
      </div>
      {addError ? <p className="text-sm text-danger-soft-foreground">{addError}</p> : null}
    </div>
  );
}
