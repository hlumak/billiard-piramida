import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '../components/site/PageLayout';
import { NewsListItem } from '../components/NewsListItem';
import { QueryError } from '../components/QueryError';
import { newsQuery } from '../lib/queries';
import { pageHead } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/news/')({
  // SSR + hover-preload: the list is server data and the page is indexable.
  // A failed fetch is the list's to say (with a retry), not a 500 for the page.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(newsQuery(getLocale())).catch(() => null),
  head: ({ match }) => pageHead(m.seo_title_news(), m.seo_desc_news(), match.pathname),
  component: NewsIndexPage
});

function NewsIndexPage() {
  const { data: news, isPending, isError, error, refetch } = useQuery(newsQuery(getLocale()));

  return (
    <PageLayout script="news" title={m.news_title()}>
      {isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isPending || !news ? (
        <div className="flex justify-center py-16">
          <Spinner aria-label={m.loading()} />
        </div>
      ) : news.length === 0 ? (
        <p className="card px-6 py-12 text-center text-lg text-cream-soft">{m.news_none()}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          {news.map(item => (
            <li key={item.id} className="anim-stagger-item">
              <NewsListItem item={item} />
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  );
}
