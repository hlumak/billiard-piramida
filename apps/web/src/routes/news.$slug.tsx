import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '../components/site/PageLayout';
import { ArticleBody } from '../components/ArticleBody';
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

/** The article carries its own h1 (the headline), so no page title above it. */
function ArticleShell({
  children,
  showTitle = true
}: {
  children: React.ReactNode;
  showTitle?: boolean;
}) {
  return (
    <PageLayout script="news" title={m.news_title()} showTitle={showTitle} width="medium">
      {children}
    </PageLayout>
  );
}

function NewsArticlePage() {
  const { slug } = Route.useParams();
  // The loader has it (or has already answered 404 / the error page)
  const { data: article } = useSuspenseQuery(newsArticleQuery(slug, getLocale()));

  return (
    <ArticleShell showTitle={false}>
      <article className="mx-auto max-w-[760px]">
        <header className="anim-reveal">
          <Link
            to="/news"
            className="text-sm font-semibold text-golden-light transition-colors hover:text-golden"
          >
            ← {m.news_all()}
          </Link>
          <time
            dateTime={article.publishedAt}
            className="mt-5 block text-sm text-grey-cool first-letter:uppercase"
          >
            {formatPublished(article.publishedAt)}
          </time>
          <h1 className="mt-3 text-[30px] leading-[1.15] font-bold tracking-[-0.01em] md:text-[42px]">
            {article.title}
          </h1>
          {article.body ? (
            <p className="mt-4 text-[17px] leading-relaxed text-cream-soft md:text-[19px]">
              {article.body}
            </p>
          ) : null}
        </header>
        {article.imageUrl ? (
          <img
            src={resolveAssetUrl(article.imageUrl)}
            alt=""
            // The box is reserved before the picture arrives (no text jump)
            className="anim-reveal mt-8 aspect-video w-full rounded-[20px] object-cover [animation-delay:100ms]"
          />
        ) : null}
        {article.content ? (
          <ArticleBody
            source={article.content}
            className="anim-reveal mt-8 [animation-delay:150ms]"
          />
        ) : null}
        <Link to="/news" className="btn-outline mt-12 h-12 px-5.5 text-[15px]">
          ← {m.news_all()}
        </Link>
      </article>
    </ArticleShell>
  );
}
