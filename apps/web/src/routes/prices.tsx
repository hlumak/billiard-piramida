import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { HOURLY_RATE_GROSZ, formatPln } from '@repo/shared';
import { PageHeader } from '../components/AppHeader';
import { QueryError } from '../components/QueryError';
import { Reveal, StaggerGroup, StaggerItem } from '../components/motion';
import { intlTag } from '../lib/format';
import { categoryLabel, groupMenu } from '../lib/menu';
import { menuQuery } from '../lib/queries';
import { m } from '../paraglide/messages.js';
import { pageMeta } from '../lib/seo';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/prices')({
  // SSR + hover-preload: menu is stable server data
  loader: ({ context }) => context.queryClient.ensureQueryData(menuQuery(getLocale())),
  head: () => ({ meta: pageMeta(m.seo_title_prices(), m.seo_desc_prices()) }),
  component: PricesPage
});

function PricesPage() {
  const { data: menu, isPending, isError, refetch } = useQuery(menuQuery(getLocale()));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="prices" />
      <main className="mt-8 flex-1">
        <Reveal className="rounded-[10px] bg-club-green-light p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-creme">{m.table_rental_price()}</p>
              <p className="text-xs text-grey-cool">{m.min_booking_note()}</p>
            </div>
            <p className="text-lg font-bold text-golden">
              {formatPln(HOURLY_RATE_GROSZ, intlTag())}{' '}
              <span className="text-sm font-medium text-creme/80">/ {m.per_hour()}</span>
            </p>
          </div>
        </Reveal>

        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isPending || !menu ? (
          <div className="flex justify-center py-16">
            <Spinner aria-label={m.loading()} />
          </div>
        ) : (
          <StaggerGroup className="mt-6 flex flex-col gap-6">
            {groupMenu(menu).map(({ category, items }) => (
              <StaggerItem key={category}>
                <section>
                  <h3 className="mb-2 text-lg font-semibold text-golden">
                    {categoryLabel(category)}
                  </h3>
                  <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {items.map(item => (
                      <li
                        key={item.id}
                        className="flex items-baseline justify-between gap-3 rounded-[10px] bg-club-green-light px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-creme">{item.name}</p>
                          {item.description ? (
                            <p className="text-xs text-grey-cool">{item.description}</p>
                          ) : null}
                        </div>
                        <p className="shrink-0 font-semibold text-golden">
                          {formatPln(item.priceGrosz, intlTag())}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}
      </main>
    </div>
  );
}
