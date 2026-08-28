/**
 * URL key from staff-authored copy. Diacritics are decomposed and dropped, so a
 * Polish or Ukrainian title still yields an ASCII slug — and a title with no
 * Latin letters at all (a fully Cyrillic one) collapses to nothing, which is
 * what `fallback` is for.
 */
export function slugify(name: string, fallback: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || fallback;
}
