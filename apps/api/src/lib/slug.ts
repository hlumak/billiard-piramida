import { randomBytes } from 'node:crypto';

/**
 * Letters Unicode does not decompose into a base letter plus accent — Polish
 * "ł" above all, which every other headline here seems to contain.
 */
const STROKED_LETTERS: Record<string, string> = {
  ł: 'l',
  đ: 'd',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss'
};

/**
 * URL key from staff-authored copy. Diacritics are decomposed and dropped, so a
 * Polish or Ukrainian title still yields an ASCII slug — and a title with no
 * Latin letters at all (a fully Cyrillic one) collapses to nothing, which is
 * what `fallback` is for.
 */
/** Numbered attempts — base, base-2 … base-20 — before a random suffix takes over. */
const MAX_SLUG_ATTEMPTS = 20;

/**
 * Insert a row under the first free slug among base, base-2, base-3…
 * `insert` must use ON CONFLICT (slug) DO NOTHING RETURNING and resolve to
 * undefined on a conflict: the database decides atomically, where the old
 * check-then-insert raced (a double-click hit the unique index as a 500) and
 * inserted attempt 19's slug unchecked.
 */
export async function insertWithFreeSlug<T>(
  base: string,
  insert: (slug: string) => Promise<T | undefined>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const row = await insert(attempt === 1 ? base : `${base}-${attempt}`);
    if (row !== undefined) return row;
  }
  // A weekly tournament under one title gets here within months, and every
  // all-Cyrillic title shares one fallback base: past the numbered ones a
  // random suffix keeps the record creatable instead of failing for good
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await insert(`${base}-${randomBytes(4).toString('hex')}`);
    if (row !== undefined) return row;
  }
  throw new Error(`no free slug for "${base}"`);
}

export function slugify(name: string, fallback: string): string {
  const base = name
    .toLowerCase()
    .replace(/[łđøæœß]/g, letter => STROKED_LETTERS[letter] ?? letter)
    .normalize('NFKD')
    // The accents NFKD split off, or each would become a hyphen in the next
    // step and cut the word in two ("wieczór" → "wieczo-r")
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || fallback;
}
