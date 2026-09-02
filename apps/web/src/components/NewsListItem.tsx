import { Link } from '@tanstack/react-router';
import { isExternalUrl, type NewsItemDto } from '@repo/shared';
import { resolveAssetUrl } from '../lib/api';
import { formatPublished, newsHref } from '../lib/news';
import { m } from '../paraglide/messages.js';

const CARD = 'block h-full overflow-hidden rounded-[10px] bg-club-green-light';

/**
 * One entry of the /news list: cover, date, headline, teaser. It is a link when
 * the card has somewhere to go (its own page, an app route or an off-site URL)
 * and a plain card that is read in place otherwise.
 */
export function NewsListItem({ item }: { item: NewsItemDto }) {
  const body = (
    <>
      {item.imageUrl ? (
        // Decorative: the headline right below carries the same information
        <img
          src={resolveAssetUrl(item.imageUrl)}
          alt=""
          loading="lazy"
          className="h-40 w-full object-cover"
        />
      ) : null}
      <div className="flex flex-col gap-1 px-4 py-3">
        <time dateTime={item.publishedAt} className="text-xs text-grey-cool">
          {formatPublished(item.publishedAt)}
        </time>
        <p className="font-semibold text-golden">{item.title}</p>
        {item.body ? <p className="text-sm text-creme/85">{item.body}</p> : null}
        {item.hasArticle ? (
          <span className="mt-1 text-sm font-semibold text-golden">{m.news_read_more()} →</span>
        ) : null}
      </div>
    </>
  );

  const href = newsHref(item);
  if (href === null) return <div className={CARD}>{body}</div>;

  const interactive = `${CARD} transition-colors hover:bg-surface-hover`;
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
