import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { NewsListItem } from '../components/NewsListItem';
import { QueryError } from '../components/QueryError';
import { StaggerGroup, StaggerItem } from '../components/motion';
import { newsQuery } from '../lib/queries';
import { pageHead } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/news/')({
  // SSR + hover-preload: the list is server data and the page is indexable
  loader: ({ context }) => context.queryClient.ensureQueryData(newsQuery(getLocale())),
  head: ({ match }) => pageHead(m.seo_title_news(), m.seo_desc_news(), match.pathname),
  component: NewsIndexPage
});

function NewsIndexPage() {
  const { data: news, isPending, isError, refetch } = useQuery(newsQuery(getLocale()));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="news" />
      <main className="mt-8 flex-1">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isPending || !news ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : news.length === 0 ? (
          <p className="py-8 text-center text-grey-cool">{m.news_none()}</p>
        ) : (
          <StaggerGroup>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {news.map(item => (
                <StaggerItem key={item.id}>
                  <NewsListItem item={item} />
                </StaggerItem>
              ))}
            </ul>
          </StaggerGroup>
        )}
      </main>
    </div>
  );
}
