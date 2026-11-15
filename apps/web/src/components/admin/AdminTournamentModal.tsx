import { useState } from 'react';
import { Button, Input, Label, Modal, TextField } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SUPPORTED_LOCALES,
  TOURNAMENT_STATUSES,
  tournamentHoldsTables,
  type AdminTournamentDto,
  type TableDto
} from '@repo/shared';
import { adminApi, adminClosureConflictsQuery, type ClosureInput } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { tablesQuery } from '../../lib/queries';
import { adminStatusLabel } from '../../lib/tournaments';
import { ClosureConflicts, SpotToggles } from './AdminClosures';
import { isDraftChanged } from './draft';
import {
  checkTournamentDraft,
  draftClosureRange,
  tournamentDraftFrom,
  tournamentErrorText,
  type TournamentDraft
} from './tournament-draft';
import { m } from '../../paraglide/messages.js';

/** Stands in for the conflicts query's input while there is nothing to ask about. */
const NO_CLOSURE: ClosureInput = {
  startDate: '2000-01-01',
  startHour: 0,
  endDate: '2000-01-01',
  endHour: 1,
  tableIds: [],
  reason: null
};

/**
 * The closure the tables would get as the form now stands, and the bookings in
 * its way. Asks only while the form is open and the draft makes a closure:
 * tables picked, hours filled in, a status that holds tables.
 */
function useTableHold(draft: TournamentDraft, isOpen: boolean) {
  const range = draftClosureRange(draft);
  const holds = tournamentHoldsTables(draft.status);
  const closure: ClosureInput | null =
    range !== null && holds && draft.tableIds.length > 0
      ? { ...range, tableIds: draft.tableIds, reason: null }
      : null;
  const conflicts = useQuery({
    ...adminClosureConflictsQuery(closure ?? NO_CLOSURE),
    enabled: isOpen && closure !== null
  });
  return {
    range,
    holds,
    conflicts,
    /** The bookings that hold up saving */
    blocking: closure !== null ? (conflicts.data ?? []) : [],
    /** The answer for the form as it now stands is still on its way */
    isChecking: closure !== null && conflicts.isFetching
  };
}

type TableHold = ReturnType<typeof useTableHold>;

/** Status, dates, hours, roster limits and the fee. */
function TournamentSchedule({
  draft,
  onChange
}: {
  draft: TournamentDraft;
  onChange: (draft: TournamentDraft) => void;
}) {
  return (
    <>
      <div>
        <p className="mb-2 text-sm text-grey-cool">{m.admin_tournament_status()}</p>
        <div className="flex flex-wrap gap-1.5">
          {TOURNAMENT_STATUSES.map(status => (
            <button
              key={status}
              type="button"
              aria-pressed={draft.status === status}
              onClick={() => onChange({ ...draft, status })}
              className={`h-9 rounded-[10px] px-3 text-sm font-semibold transition-colors ${
                draft.status === status
                  ? 'bg-golden text-btn-text'
                  : 'bg-club-green text-creme hover:bg-surface-hover'
              }`}
            >
              {adminStatusLabel(status)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          name="startsOn"
          value={draft.startsOn}
          onChange={startsOnValue => onChange({ ...draft, startsOn: startsOnValue })}
        >
          <Label>{m.admin_tournament_starts_on()}</Label>
          <Input type="date" />
        </TextField>
        <TextField
          name="registrationDeadline"
          value={draft.registrationDeadline}
          onChange={value => onChange({ ...draft, registrationDeadline: value })}
        >
          <Label>{m.admin_tournament_deadline()}</Label>
          <Input type="date" />
        </TextField>
        <TextField
          name="startHour"
          value={draft.startHour}
          onChange={value => onChange({ ...draft, startHour: value })}
        >
          <Label>{m.admin_tournament_start_hour()}</Label>
          <Input inputMode="numeric" placeholder="18" />
        </TextField>
        <TextField
          name="endHour"
          value={draft.endHour}
          onChange={value => onChange({ ...draft, endHour: value })}
        >
          <Label>{m.admin_tournament_end_hour()}</Label>
          <Input inputMode="numeric" placeholder="23" />
        </TextField>
        <TextField
          name="minPlayers"
          value={draft.minPlayers}
          onChange={value => onChange({ ...draft, minPlayers: value })}
        >
          <Label>{m.admin_tournament_min_players()}</Label>
          <Input inputMode="numeric" placeholder="16" />
        </TextField>
        <TextField
          name="maxPlayers"
          value={draft.maxPlayers}
          onChange={value => onChange({ ...draft, maxPlayers: value })}
        >
          <Label>{m.admin_tournament_max_players()}</Label>
          <Input inputMode="numeric" placeholder="16" />
        </TextField>
        <TextField
          name="entryFee"
          value={draft.entryFee}
          onChange={value => onChange({ ...draft, entryFee: value })}
        >
          <Label>{m.admin_tournament_fee()}</Label>
          <Input inputMode="decimal" placeholder="50" />
        </TextField>
      </div>
    </>
  );
}

/**
 * Under the picked tables: why they are not held yet (the status doesn't hold
 * tables, or the hours are missing), or the bookings in their way.
 */
function TableHoldNote({
  hold,
  spots,
  onShowBooking
}: {
  hold: TableHold;
  spots: TableDto[];
  onShowBooking: (phone: string) => void;
}) {
  if (!hold.holds) {
    return (
      <p className="mt-3 text-[13px] text-grey-cool">{m.admin_tournament_tables_inactive()}</p>
    );
  }
  if (hold.range === null) {
    return (
      <p className="mt-3 text-[13px] text-grey-cool">{m.admin_tournament_tables_need_time()}</p>
    );
  }
  return (
    <div className="mt-3">
      <ClosureConflicts
        conflicts={hold.conflicts}
        blocking={hold.blocking}
        complete
        spots={spots}
        startDate={hold.range.startDate}
        endDate={hold.range.endDate}
        onShowBooking={onShowBooking}
      />
    </div>
  );
}

/** The tables the tournament holds, and what stands in the way of holding them. */
function TournamentTables({
  tableIds,
  spots,
  hold,
  onChange,
  onShowBooking
}: {
  tableIds: number[];
  spots: TableDto[];
  hold: TableHold;
  onChange: (tableIds: number[]) => void;
  onShowBooking: (phone: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-creme">{m.admin_tournament_tables()}</legend>
      <p className="mt-0.5 text-[13px] text-grey-cool">{m.admin_tournament_tables_hint()}</p>
      <SpotToggles
        label={m.admin_tournament_tables()}
        tableIds={tableIds}
        spots={spots}
        onChange={onChange}
      />
      {tableIds.length === 0 ? null : (
        <TableHoldNote hold={hold} spots={spots} onShowBooking={onShowBooking} />
      )}
    </fieldset>
  );
}

/** Title, summary and announcement, once per language. */
function TournamentCopy({
  draft,
  onChange
}: {
  draft: TournamentDraft;
  onChange: (draft: TournamentDraft) => void;
}) {
  return SUPPORTED_LOCALES.map(locale => (
    <div key={locale} className="rounded-[10px] bg-club-green p-3">
      <p className="mb-2 text-xs font-bold uppercase text-golden-light">{locale}</p>
      <div className="flex flex-col gap-3">
        <TextField
          name={`title-${locale}`}
          value={draft.titles[locale]}
          onChange={value => onChange({ ...draft, titles: { ...draft.titles, [locale]: value } })}
          isRequired
        >
          <Label>{m.admin_news_title_label()}</Label>
          <Input />
        </TextField>
        <TextField
          name={`summary-${locale}`}
          value={draft.summaries[locale]}
          onChange={value =>
            onChange({ ...draft, summaries: { ...draft.summaries, [locale]: value } })
          }
        >
          <Label>{m.admin_tournament_summary_label()}</Label>
          <Input />
        </TextField>
        <div className="flex flex-col gap-1">
          <label htmlFor={`details-${locale}`} className="text-sm font-medium text-creme">
            {m.admin_tournament_details_label()}
          </label>
          {/* A plain textarea: the announcement runs to paragraphs,
              and HeroUI's TextField wraps a single-line input. */}
          <textarea
            id={`details-${locale}`}
            rows={5}
            value={draft.details[locale]}
            onChange={event =>
              onChange({
                ...draft,
                details: { ...draft.details, [locale]: event.target.value }
              })
            }
            className="w-full rounded-[10px] bg-club-green-light p-3 text-sm text-creme outline-none ring-1 ring-transparent focus:ring-golden"
          />
        </div>
      </div>
    </div>
  ));
}

/**
 * Create (item === null) or edit a tournament: schedule, the tables it holds,
 * roster limits, copy. While its tables and hours are filled in it lists the
 * bookings in their way, as the closure form does; the API closes the tables
 * itself on save, and refuses while those bookings stand.
 */
export function AdminTournamentModal({
  item,
  onShowBooking
}: {
  item: AdminTournamentDto | null;
  onShowBooking: (phone: string) => void;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState<TournamentDraft>(() => tournamentDraftFrom(item));
  const { data: spots = [] } = useQuery({ ...tablesQuery(), enabled: isOpen });

  const isChanged = isOpen && isDraftChanged(draft, tournamentDraftFrom(item));

  const open = () => {
    setDraft(tournamentDraftFrom(item));
    setOpen(true);
  };

  const check = checkTournamentDraft(draft);
  const hold = useTableHold(draft, isOpen);

  const save = useMutation({
    mutationFn: () => {
      // Save is disabled until the check passes; this keeps the input type honest
      if (!check.ok) throw new Error('invalid draft');
      return item === null
        ? adminApi.createTournament(check.input)
        : adminApi.updateTournament(item.id, check.input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament'] });
      // The tables it holds: the schedule's hatching and guests' slot grids
      queryClient.invalidateQueries({ queryKey: ['admin', 'closures'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      setOpen(false);
    },
    onError: error => {
      // A booking came in on its tables while the form was open: show it
      if (error instanceof ApiError && error.code === 'closure_conflicts') {
        void hold.conflicts.refetch();
      }
    }
  });

  const showBooking = (phone: string) => {
    setOpen(false);
    onShowBooking(phone);
  };

  const rejected = save.error instanceof ApiError ? save.error.code : null;
  const errorText = tournamentErrorText(check.ok ? null : check.problem, rejected, save.isError);

  return (
    <Modal isOpen={isOpen} onOpenChange={setOpen}>
      {item === null ? (
        <Button size="sm" className="font-semibold" onPress={open}>
          {m.admin_add_tournament()}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onPress={open}>
          {m.admin_edit_btn()}
        </Button>
      )}
      <Modal.Backdrop isDismissable={!isChanged} isKeyboardDismissDisabled={isChanged}>
        <Modal.Container scroll="inside">
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                {item === null ? m.admin_add_tournament() : m.admin_edit_btn()}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <TournamentSchedule draft={draft} onChange={setDraft} />

                <TournamentTables
                  tableIds={draft.tableIds}
                  spots={spots}
                  hold={hold}
                  onChange={tableIds => setDraft({ ...draft, tableIds })}
                  onShowBooking={showBooking}
                />

                <TextField
                  name="imageUrl"
                  value={draft.imageUrl}
                  onChange={value => setDraft({ ...draft, imageUrl: value })}
                >
                  <Label>{m.admin_image_url()}</Label>
                  <Input inputMode="url" placeholder="/news/tournament.webp" />
                </TextField>

                <TournamentCopy draft={draft} onChange={setDraft} />

                {errorText ? (
                  <p className="text-sm text-danger-soft-foreground">{errorText}</p>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="w-full font-bold"
                isDisabled={!check.ok || hold.blocking.length > 0 || hold.isChecking}
                isPending={save.isPending}
                onPress={() => save.mutate()}
              >
                {item === null ? m.admin_create_btn() : m.btn_save()}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
