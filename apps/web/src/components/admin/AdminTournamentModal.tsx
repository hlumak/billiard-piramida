import { useState } from 'react';
import { Button, Input, Label, Modal, TextField } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SUPPORTED_LOCALES, TOURNAMENT_STATUSES, type AdminTournamentDto } from '@repo/shared';
import { adminApi } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { adminStatusLabel } from '../../lib/tournaments';
import { isDraftChanged } from './draft';
import {
  checkTournamentDraft,
  tournamentDraftFrom,
  type TournamentDraft
} from './tournament-draft';
import { m } from '../../paraglide/messages.js';

/** Create (item === null) or edit a tournament: schedule, roster limits, copy. */
export function AdminTournamentModal({ item }: { item: AdminTournamentDto | null }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState<TournamentDraft>(() => tournamentDraftFrom(item));

  const isChanged = isOpen && isDraftChanged(draft, tournamentDraftFrom(item));

  const open = () => {
    setDraft(tournamentDraftFrom(item));
    setOpen(true);
  };

  const check = checkTournamentDraft(draft);

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
      setOpen(false);
    }
  });

  const rejected = save.error instanceof ApiError ? save.error.code : null;
  const problem = check.ok ? null : check.problem;
  const errorText =
    problem === 'invalid_url' || rejected === 'invalid_url'
      ? m.admin_invalid_url()
      : problem === 'deadline_after_start' || rejected === 'deadline_after_start'
        ? m.admin_tournament_deadline_after_start()
        : problem === 'min_above_max' || rejected === 'min_above_max'
          ? m.admin_tournament_min_above_max()
          : problem === 'invalid_fee'
            ? m.admin_invalid_price()
            : save.isError
              ? m.err_generic()
              : null;

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
                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.admin_tournament_status()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TOURNAMENT_STATUSES.map(status => (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={draft.status === status}
                        onClick={() => setDraft({ ...draft, status })}
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
                    onChange={startsOnValue => setDraft({ ...draft, startsOn: startsOnValue })}
                  >
                    <Label>{m.admin_tournament_starts_on()}</Label>
                    <Input type="date" />
                  </TextField>
                  <TextField
                    name="startHour"
                    value={draft.startHour}
                    onChange={value => setDraft({ ...draft, startHour: value })}
                  >
                    <Label>{m.admin_tournament_start_hour()}</Label>
                    <Input inputMode="numeric" placeholder="18" />
                  </TextField>
                  <TextField
                    name="registrationDeadline"
                    value={draft.registrationDeadline}
                    onChange={value => setDraft({ ...draft, registrationDeadline: value })}
                  >
                    <Label>{m.admin_tournament_deadline()}</Label>
                    <Input type="date" />
                  </TextField>
                  <TextField
                    name="entryFee"
                    value={draft.entryFee}
                    onChange={value => setDraft({ ...draft, entryFee: value })}
                  >
                    <Label>{m.admin_tournament_fee()}</Label>
                    <Input inputMode="decimal" placeholder="50" />
                  </TextField>
                  <TextField
                    name="minPlayers"
                    value={draft.minPlayers}
                    onChange={value => setDraft({ ...draft, minPlayers: value })}
                  >
                    <Label>{m.admin_tournament_min_players()}</Label>
                    <Input inputMode="numeric" placeholder="16" />
                  </TextField>
                  <TextField
                    name="maxPlayers"
                    value={draft.maxPlayers}
                    onChange={value => setDraft({ ...draft, maxPlayers: value })}
                  >
                    <Label>{m.admin_tournament_max_players()}</Label>
                    <Input inputMode="numeric" placeholder="16" />
                  </TextField>
                </div>

                <TextField
                  name="imageUrl"
                  value={draft.imageUrl}
                  onChange={value => setDraft({ ...draft, imageUrl: value })}
                >
                  <Label>{m.admin_image_url()}</Label>
                  <Input inputMode="url" placeholder="/news/tournament.webp" />
                </TextField>

                {SUPPORTED_LOCALES.map(locale => (
                  <div key={locale} className="rounded-[10px] bg-club-green p-3">
                    <p className="mb-2 text-xs font-bold uppercase text-golden-light">{locale}</p>
                    <div className="flex flex-col gap-3">
                      <TextField
                        name={`title-${locale}`}
                        value={draft.titles[locale]}
                        onChange={value =>
                          setDraft({ ...draft, titles: { ...draft.titles, [locale]: value } })
                        }
                        isRequired
                      >
                        <Label>{m.admin_news_title_label()}</Label>
                        <Input />
                      </TextField>
                      <TextField
                        name={`summary-${locale}`}
                        value={draft.summaries[locale]}
                        onChange={value =>
                          setDraft({ ...draft, summaries: { ...draft.summaries, [locale]: value } })
                        }
                      >
                        <Label>{m.admin_tournament_summary_label()}</Label>
                        <Input />
                      </TextField>
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`details-${locale}`}
                          className="text-sm font-medium text-creme"
                        >
                          {m.admin_tournament_details_label()}
                        </label>
                        {/* A plain textarea: the announcement runs to paragraphs,
                            and HeroUI's TextField wraps a single-line input. */}
                        <textarea
                          id={`details-${locale}`}
                          rows={5}
                          value={draft.details[locale]}
                          onChange={event =>
                            setDraft({
                              ...draft,
                              details: { ...draft.details, [locale]: event.target.value }
                            })
                          }
                          className="w-full rounded-[10px] bg-club-green-light p-3 text-sm text-creme outline-none ring-1 ring-transparent focus:ring-golden"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {errorText ? (
                  <p className="text-sm text-danger-soft-foreground">{errorText}</p>
                ) : null}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="w-full font-bold"
                isDisabled={!check.ok}
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
