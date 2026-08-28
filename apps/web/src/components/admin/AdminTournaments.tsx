import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminTournamentDto } from '@repo/shared';
import { adminApi, adminTournamentsQuery } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { formatDayLong } from '../../lib/format';
import { adminStatusLabel, rosterProgress, whenLabel } from '../../lib/tournaments';
import { m } from '../../paraglide/messages.js';
import { QueryError } from '../QueryError';
import { StaggerGroup, StaggerItem } from '../motion';
import { AdminTournamentModal } from './AdminTournamentModal';
import { AdminTournamentRoster } from './AdminTournamentRoster';

function TournamentRow({ item }: { item: AdminTournamentDto }) {
  const queryClient = useQueryClient();
  const [showRoster, setShowRoster] = useState(false);
  const { label: seats } = rosterProgress(item);
  const when = whenLabel(item);

  const remove = useMutation({
    mutationFn: () => adminApi.deleteTournament(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    }
  });

  const removeError =
    remove.error instanceof ApiError && remove.error.code === 'has_registrations'
      ? m.admin_has_registrations()
      : remove.isError
        ? m.err_generic()
        : null;

  return (
    <li
      className={`rounded-[10px] bg-club-green-light p-3 ${
        item.status === 'draft' ? 'opacity-60' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-creme">{item.title}</p>
          <p className="text-xs text-grey-cool">
            {adminStatusLabel(item.status)} · {seats}
            {item.registrationDeadline !== null
              ? ` · ${m.tournament_deadline({ date: formatDayLong(item.registrationDeadline) })}`
              : ''}
          </p>
          {when !== null ? (
            <p className="text-xs text-grey-cool first-letter:uppercase">{when}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-golden text-creme"
            aria-expanded={showRoster}
            onPress={() => setShowRoster(open => !open)}
          >
            {m.admin_roster()}
          </Button>
          <AdminTournamentModal item={item} />
          <Button
            size="sm"
            variant="danger-soft"
            isPending={remove.isPending}
            onPress={() => {
              if (window.confirm(m.admin_delete_tournament_confirm())) remove.mutate();
            }}
          >
            {m.admin_delete_btn()}
          </Button>
        </div>
      </div>

      {removeError ? (
        <p className="mt-2 text-sm text-danger-soft-foreground">{removeError}</p>
      ) : null}
      {/* Mounted only when open: one registrations query per expanded roster */}
      {showRoster ? <AdminTournamentRoster tournamentId={item.id} /> : null}
    </li>
  );
}

export function AdminTournaments() {
  const { data: items, isPending, isError, refetch } = useQuery(adminTournamentsQuery());

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isPending || !items) {
    return (
      <div className="flex justify-center py-16">
        <Spinner aria-label={m.loading()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <AdminTournamentModal item={null} />
      </div>
      {items.length === 0 ? (
        <p className="py-8 text-center text-grey-cool">{m.admin_no_tournaments()}</p>
      ) : (
        <StaggerGroup>
          <ul className="flex flex-col gap-2">
            {items.map(item => (
              <StaggerItem key={item.id}>
                <TournamentRow item={item} />
              </StaggerItem>
            ))}
          </ul>
        </StaggerGroup>
      )}
    </div>
  );
}
