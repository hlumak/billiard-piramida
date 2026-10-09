import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/AppHeader';
import { ArticleBody } from '../components/ArticleBody';
import { Reveal } from '../components/motion';
import { notFoundOn404, resolveAssetUrl } from '../lib/api';
import { formatPublished } from '../lib/news';
import { newsArticleQuery } from '../lib/queries';
import { pageHead } from '../lib/seo';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/news/$slug')({
  // An unknown or hidden article is a real 404, not a 200 that renders a spinner
  loader: ({ context, params }) =>
    context.queryClient
      .ensureQueryData(newsArticleQuery(params.slug, getLocale()))
      .catch(notFoundOn404),
  // Named after the story, with its cover as the preview: this URL gets shared
  head: ({ match, loaderData }) =>
    pageHead(
      loaderData ? `${loaderData.title} — piramida` : m.seo_title_news(),
      loaderData?.body ?? m.seo_desc_news(),
      match.pathname,
      loaderData?.imageUrl ?? undefined
    ),
  component: NewsArticlePage,
  notFoundComponent: () => (
    <ArticleShell>
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-grey-cool">{m.news_not_found()}</p>
        <Link to="/news" className="font-semibold text-golden">
          {m.news_all()}
        </Link>
      </div>
    </ArticleShell>
  )
});

function ArticleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="news" />
      <main className="mt-8 flex-1">{children}</main>
    </div>
  );
}

function NewsArticlePage() {
  const { slug } = Route.useParams();
  // The loader has it (or has already answered 404 / the error page)
  const { data: article } = useSuspenseQuery(newsArticleQuery(slug, getLocale()));

  return (
    <ArticleShell>
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
    </ArticleShell>
  );
}
