import type { NewsItemDto } from '@repo/shared';
import { formatDayLong, warsawDate } from './format';

/**
 * Where a news card leads. An explicit link wins (a promo pointing at /prices);
 * otherwise the card opens its own page when there is an article to read, and
 * a bare headline-plus-teaser card leads nowhere.
 */
export function newsHref(item: NewsItemDto): string | null {
  if (item.linkUrl !== null) return item.linkUrl;
  return item.hasArticle ? `/news/${item.slug}` : null;
}

/** "3 September 2026" in the current locale, on the club's calendar. */
export function formatPublished(instant: string): string {
  return formatDayLong(warsawDate(instant));
}
