import {
  SUPPORTED_LOCALES,
  isSafeUrl,
  type AdminNewsItemDto,
  type Locale,
  type NewsTranslationDto
} from '@repo/shared';
import type { AdminNewsInput } from '../../lib/admin-api';

/** Polish is the only required copy — the storefront falls back to it for
 *  visitors whose locale has no translation yet (see /api/news). */
export const REQUIRED_LOCALE: Locale = 'pl';

/** The news editor's form state: every field as typed. */
export interface NewsDraft {
  slug: string;
  imageUrl: string;
  linkUrl: string;
  sortOrder: string;
  titles: Record<Locale, string>;
  bodies: Record<Locale, string>;
  contents: Record<Locale, string>;
}

export function newsDraftFrom(item: AdminNewsItemDto | null): NewsDraft {
  const titles = { uk: '', pl: '', en: '' };
  const bodies = { uk: '', pl: '', en: '' };
  const contents = { uk: '', pl: '', en: '' };
  for (const t of item?.translations ?? []) {
    titles[t.locale] = t.title;
    bodies[t.locale] = t.body ?? '';
    contents[t.locale] = t.content ?? '';
  }
  return {
    slug: item?.slug ?? '',
    imageUrl: item?.imageUrl ?? '',
    linkUrl: item?.linkUrl ?? '',
    sortOrder: String(item?.sortOrder ?? 0),
    titles,
    bodies,
    contents
  };
}

/**
 * The draft as the API input, or why it isn't one yet: `invalid_url` has a
 * message of its own; `incomplete` (no Polish headline, or a bad order) keeps
 * Save disabled. `slug` is what staff typed, sent only when creating — left
 * blank, the server derives it from the Polish headline.
 */
export type NewsDraftCheck =
  | { ok: true; input: Omit<AdminNewsInput, 'slug'>; slug: string | null }
  | { ok: false; problem: 'invalid_url' | 'incomplete' };

export function checkNewsDraft(draft: NewsDraft): NewsDraftCheck {
  const imageUrl = draft.imageUrl.trim() || null;
  const linkUrl = draft.linkUrl.trim() || null;
  const slug = draft.slug.trim();
  const sortOrder = Number(draft.sortOrder);
  // A locale with a blank headline is left out entirely
  const translations: NewsTranslationDto[] = SUPPORTED_LOCALES.flatMap(locale => {
    const title = draft.titles[locale].trim();
    if (title === '') return [];
    return [
      {
        locale,
        title,
        body: draft.bodies[locale].trim() || null,
        content: draft.contents[locale].trim() || null
      }
    ];
  });

  // The server re-checks both URLs; catching them here spares a round trip
  if (![imageUrl, linkUrl].every(url => url === null || isSafeUrl(url))) {
    return { ok: false, problem: 'invalid_url' };
  }
  if (
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    !translations.some(t => t.locale === REQUIRED_LOCALE)
  ) {
    return { ok: false, problem: 'incomplete' };
  }
  return {
    ok: true,
    input: { imageUrl, linkUrl, sortOrder, translations },
    slug: slug === '' ? null : slug
  };
}
