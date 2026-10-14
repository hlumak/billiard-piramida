import { useRef, useState } from 'react';
import { Button, Input, Label, Modal, TextArea, TextField } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { SUPPORTED_LOCALES, type AdminNewsItemDto, type Locale } from '@repo/shared';
import { adminApi } from '../../lib/admin-api';
import { isDraftChanged } from './draft';
import { ApiError } from '../../lib/api';
import { m } from '../../paraglide/messages.js';
import { localizeHref } from '../../paraglide/runtime.js';
import { AdminImageField } from './AdminImageField';
import { uploadErrorMessage } from './upload-errors';
import { REQUIRED_LOCALE, checkNewsDraft, newsDraftFrom, type NewsDraft } from './news-draft';

/** Mirrors the API's cap on a single picture. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Create (item === null) or edit a news card: cover, link, order, and per
 * locale a headline, a teaser and an optional article that gives the card its
 * own page at /news/:slug. Article pictures are uploaded from here and dropped
 * into the text as `![](url)` lines — see `parseArticle` for the markup.
 */
export function AdminNewsModal({ item }: { item: AdminNewsItemDto | null }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewsDraft>(() => newsDraftFrom(item));
  const [insertError, setInsertError] = useState<string | null>(null);
  // One hidden file input serves all three article fields; this says which
  // one asked for the picture
  const fileInput = useRef<HTMLInputElement>(null);
  const insertTarget = useRef<Locale>('pl');

  const isChanged = isOpen && isDraftChanged(draft, newsDraftFrom(item));

  const open = () => {
    setDraft(newsDraftFrom(item));
    setInsertError(null);
    setOpen(true);
  };

  const check = checkNewsDraft(draft);

  const save = useMutation({
    mutationFn: () => {
      // Save is disabled until the check passes; this keeps the input type honest
      if (!check.ok) throw new Error('invalid draft');
      const { input, slug } = check;
      return item === null
        ? adminApi.createNewsItem(slug === null ? input : { ...input, slug })
        : adminApi.updateNewsItem(item.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'news'] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
      setOpen(false);
    }
  });

  // No query is invalidated here on purpose: uploading a picture only creates a
  // file and hands back its URL, which lands in the draft. Nothing cached reads
  // the upload store, and the storefront/staff lists only change when the card
  // is saved — `save` above owns that invalidation.
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  const insertPicture = useMutation({
    mutationFn: ({ file }: { file: File; locale: Locale }) => adminApi.uploadImage(file),
    onMutate: () => setInsertError(null),
    onSuccess: ({ url }, { locale }) =>
      // Functional update: the upload may finish while another field is being typed
      setDraft(current => {
        const existing = current.contents[locale].trimEnd();
        const line = `![](${url})`;
        return {
          ...current,
          contents: {
            ...current.contents,
            [locale]: existing === '' ? line : `${existing}\n\n${line}\n`
          }
        };
      }),
    onError: err => setInsertError(uploadErrorMessage(err))
  });

  const pickPicture = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setInsertError(m.admin_image_too_large());
      return;
    }
    insertPicture.mutate({ file, locale: insertTarget.current });
  };

  const rejectedUrl = save.error instanceof ApiError && save.error.code === 'invalid_url';
  const urlProblem = (!check.ok && check.problem === 'invalid_url') || rejectedUrl;
  const errorText = urlProblem
    ? m.admin_invalid_url()
    : (insertError ?? (save.isError ? m.err_generic() : null));

  return (
    <Modal isOpen={isOpen} onOpenChange={setOpen}>
      {item === null ? (
        <Button size="sm" className="font-semibold" onPress={open}>
          {m.admin_add_news()}
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
                {item === null ? m.admin_add_news() : m.admin_edit_btn()}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <AdminImageField
                  value={draft.imageUrl}
                  onChange={url => setDraft(current => ({ ...current, imageUrl: url }))}
                />

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

                {/* The page address is fixed once the story is out — links to
                    it may already be in circulation */}
                {item === null ? (
                  <TextField
                    name="slug"
                    value={draft.slug}
                    onChange={value => setDraft({ ...draft, slug: value })}
                  >
                    <Label>{m.admin_slug_label()}</Label>
                    <Input placeholder="nowe-stoly" />
                    <p className="text-xs text-grey-cool">{m.admin_slug_hint()}</p>
                  </TextField>
                ) : (
                  <p className="text-sm text-grey-cool">
                    {m.admin_page_address()}:{' '}
                    <a
                      href={localizeHref(`/news/${item.slug}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-golden hover:text-golden-hover"
                    >
                      /news/{item.slug}
                    </a>
                  </p>
                )}

                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={event => {
                    pickPicture(event.currentTarget.files?.[0]);
                    // Picking the same file again must fire change again
                    event.currentTarget.value = '';
                  }}
                />

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
                        isRequired={locale === REQUIRED_LOCALE}
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
                      <TextField
                        name={`content-${locale}`}
                        value={draft.contents[locale]}
                        onChange={value =>
                          setDraft({ ...draft, contents: { ...draft.contents, [locale]: value } })
                        }
                      >
                        <Label>{m.admin_news_content_label()}</Label>
                        <TextArea rows={6} className="min-h-32 font-mono text-sm" />
                        <p className="text-xs text-grey-cool">{m.admin_news_content_hint()}</p>
                      </TextField>
                      <div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-golden text-creme"
                          isPending={insertPicture.isPending}
                          isDisabled={insertPicture.isPending}
                          onPress={() => {
                            insertTarget.current = locale;
                            fileInput.current?.click();
                          }}
                        >
                          <ImagePlus className="size-4" aria-hidden />
                          {m.admin_insert_image()}
                        </Button>
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
