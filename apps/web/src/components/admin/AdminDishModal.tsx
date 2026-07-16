import { useState } from 'react';
import { Button, Input, Label, Modal, TextField } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminMenuItemDto, Locale, MenuTranslationDto } from '@repo/shared';
import { adminApi } from '../../lib/admin-api';
import { categoryLabel } from '../../lib/menu';
import { m } from '../../paraglide/messages.js';

const CATEGORIES = ['snack', 'main', 'drink', 'dessert'] as const;
const LOCALES: Locale[] = ['uk', 'pl', 'en'];

interface DishDraft {
  category: string;
  price: string;
  names: Record<Locale, string>;
  descriptions: Record<Locale, string>;
}

function draftFrom(item: AdminMenuItemDto | null): DishDraft {
  const names = { uk: '', pl: '', en: '' };
  const descriptions = { uk: '', pl: '', en: '' };
  for (const t of item?.translations ?? []) {
    names[t.locale] = t.name;
    descriptions[t.locale] = t.description ?? '';
  }
  return {
    category: item?.category ?? 'snack',
    price: item ? String(item.priceGrosz / 100) : '',
    names,
    descriptions
  };
}

/** Create (item === null) or edit a dish, names and descriptions in all locales. */
export function AdminDishModal({ item }: { item: AdminMenuItemDto | null }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState<DishDraft>(() => draftFrom(item));

  const open = () => {
    setDraft(draftFrom(item));
    setOpen(true);
  };

  const priceGrosz = Math.round(Number(draft.price.replace(',', '.')) * 100);
  const translations: MenuTranslationDto[] = LOCALES.filter(
    locale => draft.names[locale].trim() !== ''
  ).map(locale => ({
    locale,
    name: draft.names[locale].trim(),
    description: draft.descriptions[locale].trim() || null
  }));
  const canSubmit =
    Number.isFinite(priceGrosz) && priceGrosz >= 0 && translations.length === LOCALES.length;

  const save = useMutation({
    mutationFn: () =>
      item === null
        ? adminApi.createMenuItem({ category: draft.category, priceGrosz, translations })
        : adminApi.updateMenuItem(item.id, {
            category: draft.category,
            priceGrosz,
            translations
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] });
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setOpen(false);
    }
  });

  return (
    <Modal>
      {item === null ? (
        <Button size="sm" className="font-semibold" onPress={open}>
          {m.admin_add_dish()}
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
                {item === null ? m.admin_add_dish() : m.admin_edit_btn()}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-2 text-sm text-grey-cool">{m.admin_category()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map(category => (
                      <button
                        key={category}
                        type="button"
                        aria-pressed={draft.category === category}
                        onClick={() => setDraft({ ...draft, category })}
                        className={`h-9 rounded-[10px] px-3 text-sm font-semibold transition-colors ${
                          draft.category === category
                            ? 'bg-golden text-btn-text'
                            : 'bg-club-green text-creme hover:bg-surface-hover'
                        }`}
                      >
                        {categoryLabel(category)}
                      </button>
                    ))}
                  </div>
                </div>

                <TextField
                  name="price"
                  value={draft.price}
                  onChange={price => setDraft({ ...draft, price })}
                >
                  <Label>{m.admin_price_label()}</Label>
                  <Input inputMode="decimal" placeholder="25" />
                </TextField>

                {LOCALES.map(locale => (
                  <div key={locale} className="rounded-[10px] bg-club-green p-3">
                    <p className="mb-2 text-xs font-bold uppercase text-golden">{locale}</p>
                    <div className="flex flex-col gap-3">
                      <TextField
                        name={`name-${locale}`}
                        value={draft.names[locale]}
                        onChange={value =>
                          setDraft({ ...draft, names: { ...draft.names, [locale]: value } })
                        }
                        isRequired
                      >
                        <Label>{m.name_label()}</Label>
                        <Input />
                      </TextField>
                      <TextField
                        name={`description-${locale}`}
                        value={draft.descriptions[locale]}
                        onChange={value =>
                          setDraft({
                            ...draft,
                            descriptions: { ...draft.descriptions, [locale]: value }
                          })
                        }
                      >
                        <Label>{m.admin_description()}</Label>
                        <Input />
                      </TextField>
                    </div>
                  </div>
                ))}

                {save.isError ? (
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
