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
/** Attempts before giving up: base, base-2 … base-20. */
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
  throw new Error(`no free slug for "${base}" after ${MAX_SLUG_ATTEMPTS} attempts`);
}

export function slugify(name: string, fallback: string): string {
  const base = name
    .toLowerCase()
    .replace(/[łđøæœß]/g, letter => STROKED_LETTERS[letter] ?? letter)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || fallback;
}
