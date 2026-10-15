import { Link } from '@tanstack/react-router';
import { isExternalUrl, type NewsItemDto } from '@repo/shared';
import { resolveAssetUrl } from '../lib/api';
import { formatPublished, newsHref } from '../lib/news';
import { m } from '../paraglide/messages.js';

const CARD = 'card flex h-full flex-col overflow-hidden';

/**
 * One news card: cover, date, headline, teaser, and "read more" when there is
 * somewhere to go — its own page, an app route or an off-site link. A card with
 * nowhere to go is read in place and does not pretend to be a link.
 */
export function NewsListItem({ item }: { item: NewsItemDto }) {
  const href = newsHref(item);
  const body = (
    <>
      {item.imageUrl ? (
        // Decorative: the headline right below carries the same information
        <img
          src={resolveAssetUrl(item.imageUrl)}
          alt=""
          loading="lazy"
          className="aspect-[16/7] w-full object-cover"
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-2.5 p-5.5 md:p-7">
        <time
          dateTime={item.publishedAt}
          className="text-[13px] text-grey-cool first-letter:uppercase"
        >
          {formatPublished(item.publishedAt)}
        </time>
        <p className="text-[19px] leading-snug font-bold md:text-2xl">{item.title}</p>
        {item.body ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-cream-soft md:text-base">
            {item.body}
          </p>
        ) : null}
        {href !== null ? (
          <span className="mt-auto pt-2 text-sm font-bold text-golden-light md:text-[15px]">
            {m.news_read_more()} →
          </span>
        ) : null}
      </div>
    </>
  );

  if (href === null) return <div className={CARD}>{body}</div>;

  const interactive = `${CARD} lift text-creme`;
  return isExternalUrl(href) ? (
    <a href={href} target="_blank" rel="noreferrer" className={interactive}>
      {body}
    </a>
  ) : (
    <Link to={href} className={interactive}>
      {body}
    </Link>
  );
}
