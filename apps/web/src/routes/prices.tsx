import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { formatPln } from '@repo/shared';
import { PageLayout } from '../components/site/PageLayout';
import { QueryError } from '../components/QueryError';
import { ReadyToPlay } from '../components/site/ReadyToPlay';
import { RateTiles } from '../components/RateTiles';
import { SportCardsBand } from '../components/SportCardsBand';
import { intlTag } from '../lib/format';
import { categoryLabel, groupMenu } from '../lib/menu';
import { menuQuery } from '../lib/queries';
import { m } from '../paraglide/messages.js';
import { pageHead } from '../lib/seo';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/prices')({
  // SSR + hover-preload: menu is stable server data
  loader: ({ context }) => context.queryClient.ensureQueryData(menuQuery(getLocale())),
  head: ({ match }) => pageHead(m.seo_title_prices(), m.seo_desc_prices(), match.pathname),
  component: PricesPage
});

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-6">
      <h2 className="text-xl font-bold md:text-[26px]">{title}</h2>
      <p className="text-[13px] text-grey-cool md:text-sm">{note}</p>
    </div>
  );
}

function PricesPage() {
  const { data: menu, isPending, isError, error, refetch } = useQuery(menuQuery(getLocale()));

  return (
    <PageLayout script="prices" title={m.menu_prices()}>
      <section className="anim-reveal">
        <SectionHead title={m.prices_rent()} note={m.prices_rent_note()} />
        <div className="mt-4 md:mt-5">
          <RateTiles withBooking />
        </div>
        <SportCardsBand />
      </section>

      <section className="mt-11 md:mt-18">
        <SectionHead title={m.prices_bar()} note={m.prices_bar_note()} />
        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : isPending || !menu ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : (
          groupMenu(menu).map(({ category, items }) => (
            <section key={category} className="anim-reveal">
              <h3 className="mt-3.5 text-xs font-bold tracking-[0.18em] text-golden-light uppercase md:mt-6 md:text-[13px]">
                {categoryLabel(category)}
              </h3>
              <ul className="mt-1.5 grid grid-cols-1 md:mt-3 md:grid-cols-2 md:gap-x-14">
                {items.map(item => (
                  <li key={item.id} className="border-b border-line py-4 md:py-4.5">
                    {/* Name and price on one line, a dotted leader between, like a printed menu */}
                    <div className="flex items-baseline gap-2.5 md:gap-3">
                      <span className="font-semibold md:text-[17px]">{item.name}</span>
                      <span
                        aria-hidden
                        className="flex-1 border-b-2 border-dotted border-creme/25"
                      />
                      <span className="font-bold whitespace-nowrap text-golden tabular-nums md:text-[17px]">
                        {formatPln(item.priceGrosz, intlTag())}
                      </span>
                    </div>
                    {item.description ? (
                      <p className="mt-1 text-[13px] text-grey-cool md:text-sm">
                        {item.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </section>

      <ReadyToPlay className="mt-10 md:mt-18" />
    </PageLayout>
  );
}
