import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { ArticleBody } from '../components/ArticleBody';
import { Reveal } from '../components/motion';
import { ApiError, resolveAssetUrl } from '../lib/api';
import { formatPublished } from '../lib/news';
import { newsArticleQuery } from '../lib/queries';
import { pageHead } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/news/$slug')({
  // Prefetch for SSR and hover-preload; the 404 is owned by the component
  loader: ({ context, params }) =>
    context.queryClient
      .ensureQueryData(newsArticleQuery(params.slug, getLocale()))
      .catch(() => null),
  // Named after the story, with its cover as the preview: this URL gets shared
  head: ({ match, loaderData }) =>
    pageHead(
      loaderData ? `${loaderData.title} — piramida` : m.seo_title_news(),
      loaderData?.body ?? m.seo_desc_news(),
      match.pathname,
      loaderData?.imageUrl ?? undefined
    ),
  component: NewsArticlePage
});

function NewsArticlePage() {
  const { slug } = Route.useParams();
  const { data: article, isPending, error } = useQuery(newsArticleQuery(slug, getLocale()));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="news" />
      <main className="mt-8 flex-1">
        {isPending ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : article ? (
          <article className="flex flex-col gap-5">
            {article.imageUrl ? (
              <Reveal>
                <img
                  src={resolveAssetUrl(article.imageUrl)}
                  alt=""
                  className="max-h-96 w-full rounded-[10px] object-cover"
                />
              </Reveal>
            ) : null}
            <Reveal delay={0.05}>
              <header className="flex flex-col gap-2">
                <time dateTime={article.publishedAt} className="text-sm text-grey-cool">
                  {formatPublished(article.publishedAt)}
                </time>
                <h1 className="text-2xl font-bold text-golden md:text-3xl">{article.title}</h1>
                {article.body ? <p className="text-lg text-creme/90">{article.body}</p> : null}
              </header>
            </Reveal>
            {article.content ? (
              <Reveal delay={0.1}>
                <ArticleBody source={article.content} />
              </Reveal>
            ) : null}
            <Reveal delay={0.15}>
              <Link to="/news" className="font-semibold text-golden hover:text-golden-hover">
                ← {m.news_all()}
              </Link>
            </Reveal>
          </article>
        ) : (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-grey-cool">
              {error instanceof ApiError && error.status === 404
                ? m.news_not_found()
                : m.err_generic()}
            </p>
            <Link to="/news" className="font-semibold text-golden">
              {m.news_all()}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
