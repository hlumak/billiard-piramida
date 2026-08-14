import { useState } from 'react';
import { Button, Input, Label, Modal, TextField } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  isSafeUrl,
  type AdminNewsItemDto,
  type Locale,
  type NewsTranslationDto
} from '@repo/shared';
import { adminApi } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { m } from '../../paraglide/messages.js';

const LOCALES: Locale[] = ['uk', 'pl', 'en'];

interface NewsDraft {
  imageUrl: string;
  linkUrl: string;
  sortOrder: string;
  titles: Record<Locale, string>;
  bodies: Record<Locale, string>;
}

function draftFrom(item: AdminNewsItemDto | null): NewsDraft {
  const titles = { uk: '', pl: '', en: '' };
  const bodies = { uk: '', pl: '', en: '' };
  for (const t of item?.translations ?? []) {
    titles[t.locale] = t.title;
    bodies[t.locale] = t.body ?? '';
  }
  return {
    imageUrl: item?.imageUrl ?? '',
    linkUrl: item?.linkUrl ?? '',
    sortOrder: String(item?.sortOrder ?? 0),
    titles,
    bodies
  };
}

/** Create (item === null) or edit a news card: copy in all locales + image/link. */
export function AdminNewsModal({ item }: { item: AdminNewsItemDto | null }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewsDraft>(() => draftFrom(item));

  const open = () => {
    setDraft(draftFrom(item));
    setOpen(true);
  };

  const imageUrl = draft.imageUrl.trim() || null;
  const linkUrl = draft.linkUrl.trim() || null;
  const sortOrder = Number(draft.sortOrder);
  const translations: NewsTranslationDto[] = LOCALES.flatMap(locale => {
    const title = draft.titles[locale].trim();
    return title === '' ? [] : [{ locale, title, body: draft.bodies[locale].trim() || null }];
  });
  // The server re-checks both URLs; catching them here spares a round trip
  const urlsOk = [imageUrl, linkUrl].every(url => url === null || isSafeUrl(url));
  const canSubmit =
    urlsOk &&
    Number.isInteger(sortOrder) &&
    sortOrder >= 0 &&
    translations.length === LOCALES.length;

  const save = useMutation({
    mutationFn: () => {
      const input = { imageUrl, linkUrl, sortOrder, translations };
      return item === null
        ? adminApi.createNewsItem(input)
        : adminApi.updateNewsItem(item.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'news'] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
      setOpen(false);
    }
  });

  const rejectedUrl = save.error instanceof ApiError && save.error.code === 'invalid_url';

  return (
    <Modal>
      {item === null ? (
        <Button size="sm" className="font-semibold" onPress={open}>
          {m.admin_add_news()}
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
                {item === null ? m.admin_add_news() : m.admin_edit_btn()}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <TextField
                  name="imageUrl"
                  value={draft.imageUrl}
                  onChange={value => setDraft({ ...draft, imageUrl: value })}
                >
                  <Label>{m.admin_image_url()}</Label>
                  <Input inputMode="url" placeholder="/news/tournament.webp" />
                </TextField>

                <TextField
                  name="linkUrl"
                  value={draft.linkUrl}
                  onChange={value => setDraft({ ...draft, linkUrl: value })}
                >
                  <Label>{m.admin_link_url()}</Label>
                  <Input inputMode="url" placeholder="/book" />
                </TextField>

                <TextField
                  name="sortOrder"
                  value={draft.sortOrder}
                  onChange={value => setDraft({ ...draft, sortOrder: value })}
                >
                  <Label>{m.admin_sort_order()}</Label>
                  <Input inputMode="numeric" placeholder="0" />
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
                        name={`body-${locale}`}
                        value={draft.bodies[locale]}
                        onChange={value =>
                          setDraft({ ...draft, bodies: { ...draft.bodies, [locale]: value } })
                        }
                      >
                        <Label>{m.admin_news_body_label()}</Label>
                        <Input />
                      </TextField>
                    </div>
                  </div>
                ))}

                {!urlsOk || rejectedUrl ? (
                  <p className="text-sm text-danger-soft-foreground">{m.admin_invalid_url()}</p>
                ) : save.isError ? (
                  <p className="text-sm text-danger-soft-foreground">{m.err_generic()}</p>
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
