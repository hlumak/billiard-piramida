import { useState } from 'react';
import { Button, Input, Label, Spinner, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBlacklistEntryDto } from '@repo/shared';
import { formatPhone, isValidPhone } from '@repo/shared/phone';
import { adminApi, adminBlacklistQuery } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { formatDayLong, warsawDate } from '../../lib/format';
import { m } from '../../paraglide/messages.js';
import { PhoneField } from '../PhoneField';
import { QueryError } from '../QueryError';
import { StaggerGroup, StaggerItem } from '../motion';

const ALERT = 'text-sm text-danger-soft-foreground';

/** Black-list writes change who may book, so the customers list refreshes too. */
function useInvalidateBlacklist() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin'] });
}

function EntryRow({ entry }: { entry: AdminBlacklistEntryDto }) {
  const invalidate = useInvalidateBlacklist();
  const remove = useMutation({
    mutationFn: () => adminApi.removeFromBlacklist(entry.phone),
    onSuccess: invalidate
  });

  const reason =
    entry.reason === 'no_show' && entry.lastNoShowAt !== null
      ? m.admin_blacklist_reason_no_show({ date: formatDayLong(warsawDate(entry.lastNoShowAt)) })
      : m.admin_blacklist_reason_manual();

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-creme">
            {entry.name ?? formatPhone(entry.phone)}
            {entry.name !== null ? (
              <a
                href={`tel:${entry.phone}`}
                className="ml-2 text-sm font-normal text-golden-light hover:underline"
              >
                {formatPhone(entry.phone)}
              </a>
            ) : null}
          </p>
          <p className="text-xs text-grey-cool">
            {reason}
            {entry.noShowCount > 1 ? ` · ${m.admin_no_shows({ n: entry.noShowCount })}` : ''}
          </p>
          {entry.note ? <p className="mt-1 text-sm text-creme/85">{entry.note}</p> : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-golden text-creme"
          isPending={remove.isPending}
          onPress={() => {
            if (
              window.confirm(m.admin_blacklist_remove_confirm({ phone: formatPhone(entry.phone) }))
            )
              remove.mutate();
          }}
        >
          {m.admin_blacklist_remove()}
        </Button>
      </div>
      {remove.isError ? (
        <p role="alert" className={`mt-2 ${ALERT}`}>
          {m.err_generic()}
        </p>
      ) : null}
    </div>
  );
}

function AddForm() {
  const invalidate = useInvalidateBlacklist();
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const add = useMutation({
    mutationFn: () => adminApi.addToBlacklist(phone, note.trim() || null),
    onSuccess: () => {
      setPhone('');
      setNote('');
      invalidate();
    }
  });
  const error =
    add.error instanceof ApiError && add.error.code === 'already_blacklisted'
      ? m.admin_blacklist_exists()
      : add.error instanceof ApiError && add.error.code === 'invalid_phone'
        ? m.err_phone_invalid()
        : add.isError
          ? m.err_generic()
          : null;

  return (
    <form
      className="flex flex-col gap-3 card p-4"
      onSubmit={event => {
        event.preventDefault();
        if (isValidPhone(phone)) add.mutate();
      }}
    >
      <p className="text-sm font-semibold text-golden-light">{m.admin_blacklist_add()}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <PhoneField
            name="blacklistPhone"
            value={phone}
            onChange={value => {
              setPhone(value);
              add.reset();
            }}
          />
        </div>
        <TextField name="blacklistNote" value={note} onChange={setNote} className="min-w-48 flex-1">
          <Label>{m.admin_blacklist_note()}</Label>
          <Input maxLength={300} />
        </TextField>
        <Button
          type="submit"
          size="sm"
          className="h-10"
          isDisabled={!isValidPhone(phone)}
          isPending={add.isPending}
        >
          {m.admin_blacklist_add()}
        </Button>
      </div>
      {error ? (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Numbers that may not book online: clients who booked and did not come
 * (marked from the bookings list) and any staff add by hand. They can still
 * book by phone; removing a number forgives it.
 */
export function AdminBlacklist() {
  const { data: entries, isPending, isError, refetch } = useQuery(adminBlacklistQuery());

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-grey-cool">{m.admin_blacklist_hint()}</p>
      <AddForm />
      {isError && !entries ? (
        <QueryError onRetry={() => refetch()} />
      ) : isPending || !entries ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-grey-cool">{m.admin_blacklist_empty()}</p>
      ) : (
        <StaggerGroup>
          <ul className="flex flex-col gap-2">
            {entries.map(entry => (
              <StaggerItem key={entry.phone} as="li">
                <EntryRow entry={entry} />
              </StaggerItem>
            ))}
          </ul>
        </StaggerGroup>
      )}
    </div>
  );
}
