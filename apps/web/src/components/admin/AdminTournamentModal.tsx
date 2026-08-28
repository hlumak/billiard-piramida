import { useState } from 'react';
import { Button, Input, Label, Modal, TextField } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MAX_TOURNAMENT_PLAYERS,
  TOURNAMENT_STATUSES,
  isIsoDate,
  isSafeUrl,
  type AdminTournamentDto,
  type IsoDate,
  type Locale,
  type TournamentStatus,
  type TournamentTranslationDto
} from '@repo/shared';
import { adminApi, type AdminTournamentInput } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { adminStatusLabel } from '../../lib/tournaments';
import { m } from '../../paraglide/messages.js';

const LOCALES: Locale[] = ['uk', 'pl', 'en'];

interface TournamentDraft {
  status: TournamentStatus;
  startsOn: string;
  startHour: string;
  registrationDeadline: string;
  /** Entered in złoty; converted to grosze on submit */
  entryFee: string;
  minPlayers: string;
  maxPlayers: string;
  imageUrl: string;
  titles: Record<Locale, string>;
  summaries: Record<Locale, string>;
  details: Record<Locale, string>;
}

function draftFrom(item: AdminTournamentDto | null): TournamentDraft {
  const titles = { uk: '', pl: '', en: '' };
  const summaries = { uk: '', pl: '', en: '' };
  const details = { uk: '', pl: '', en: '' };
  for (const t of item?.translations ?? []) {
    titles[t.locale] = t.title;
    summaries[t.locale] = t.summary ?? '';
    details[t.locale] = t.details ?? '';
  }
  return {
    status: item?.status ?? 'draft',
    startsOn: item?.startsOn ?? '',
    startHour: item?.startHour === null || item === null ? '' : String(item.startHour),
    registrationDeadline: item?.registrationDeadline ?? '',
    entryFee: item?.entryFeeGrosz != null ? String(item.entryFeeGrosz / 100) : '',
    minPlayers: String(item?.minPlayers ?? 0),
    maxPlayers: item?.maxPlayers != null ? String(item.maxPlayers) : '',
    imageUrl: item?.imageUrl ?? '',
    titles,
    summaries,
    details
  };
}

/** "" clears the column; anything else must parse as a calendar date. */
function parseDate(value: string): IsoDate | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return isIsoDate(trimmed) ? trimmed : undefined;
}

/** "" clears; otherwise an integer within [min, max], or undefined when unusable. */
function parseCount(value: string, min: number, max: number): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

/** Create (item === null) or edit a tournament: schedule, roster limits, copy. */
export function AdminTournamentModal({ item }: { item: AdminTournamentDto | null }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState<TournamentDraft>(() => draftFrom(item));

  const open = () => {
    setDraft(draftFrom(item));
    setOpen(true);
  };

  const startsOn = parseDate(draft.startsOn);
  const registrationDeadline = parseDate(draft.registrationDeadline);
  const startHour = parseCount(draft.startHour, 0, 23);
  const maxPlayers = parseCount(draft.maxPlayers, 2, MAX_TOURNAMENT_PLAYERS);
  const minPlayers = parseCount(draft.minPlayers, 0, MAX_TOURNAMENT_PLAYERS) ?? undefined;
  const feeInput = draft.entryFee.trim().replace(',', '.');
  const entryFeeGrosz = feeInput === '' ? null : Math.round(Number(feeInput) * 100);
  const imageUrl = draft.imageUrl.trim() || null;

  const translations: TournamentTranslationDto[] = LOCALES.flatMap(locale => {
    const title = draft.titles[locale].trim();
    if (title === '') return [];
    return [
      {
        locale,
        title,
        summary: draft.summaries[locale].trim() || null,
        details: draft.details[locale].trim() || null
      }
    ];
  });

  // The server re-checks all of it; catching it here spares a round trip
  const urlOk = imageUrl === null || isSafeUrl(imageUrl);
  const feeOk = entryFeeGrosz === null || (Number.isFinite(entryFeeGrosz) && entryFeeGrosz >= 0);
  const datesOk =
    startsOn !== undefined &&
    registrationDeadline !== undefined &&
    startHour !== undefined &&
    maxPlayers !== undefined &&
    minPlayers !== undefined;
  // `== null` on purpose: an unparseable date is undefined here, and it is
  // `datesOk` that reports it — this check only owns the ordering.
  const orderOk =
    startsOn == null || registrationDeadline == null || registrationDeadline <= startsOn;
  const canSubmit = urlOk && feeOk && datesOk && orderOk && translations.length === LOCALES.length;

  const save = useMutation({
    mutationFn: () => {
      // Guarded by canSubmit; narrowing here keeps the input type honest
      if (!datesOk || minPlayers === undefined) throw new Error('invalid draft');
      const input: AdminTournamentInput = {
        status: draft.status,
        startsOn,
        startHour,
        registrationDeadline,
        entryFeeGrosz,
        minPlayers,
        maxPlayers,
        imageUrl,
        translations
      };
      return item === null
        ? adminApi.createTournament(input)
        : adminApi.updateTournament(item.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament'] });
      setOpen(false);
    }
  });

  const rejected = save.error instanceof ApiError ? save.error.code : null;
  const errorText =
    !urlOk || rejected === 'invalid_url'
      ? m.admin_invalid_url()
      : !orderOk || rejected === 'deadline_after_start'
        ? m.admin_tournament_deadline_after_start()
        : save.isError
          ? m.err_generic()
          : null;

  return (
    <Modal>
      {item === null ? (
        <Button size="sm" className="font-semibold" onPress={open}>
          {m.admin_add_tournament()}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onPress={open}>
          {m.admin_edit_btn()}
        </Button>
      )}
      <Modal.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
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

                {LOCALES.map(locale => (
                  <div key={locale} className="rounded-[10px] bg-club-green p-3">
                    <p className="mb-2 text-xs font-bold uppercase text-golden">{locale}</p>
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
                isDisabled={!canSubmit}
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
