import { Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { SPORT_CARD_DISCOUNT_GROSZ, formatPln } from '@repo/shared';
import { PageHeader } from '../components/AppHeader';
import { PartnerCardLogos } from '../components/PartnerCardLogos';
import { QueryError } from '../components/QueryError';
import { Reveal, StaggerGroup, StaggerItem } from '../components/motion';
import { intlTag } from '../lib/format';
import { categoryLabel, groupMenu } from '../lib/menu';
import { menuQuery } from '../lib/queries';
import { useVenueConfig } from '../lib/venue-config';
import { m } from '../paraglide/messages.js';
import { pageHead } from '../lib/seo';
import { getLocale } from '../paraglide/runtime.js';

export const Route = createFileRoute('/prices')({
  // SSR + hover-preload: menu is stable server data
  loader: ({ context }) => context.queryClient.ensureQueryData(menuQuery(getLocale())),
  head: ({ match }) => pageHead(m.seo_title_prices(), m.seo_desc_prices(), match.pathname),
  component: PricesPage
});

function PricesPage() {
  const { data: menu, isPending, isError, refetch } = useQuery(menuQuery(getLocale()));
  const { rates } = useVenueConfig();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-14 md:max-w-2xl">
      <PageHeader title="prices" />
      <main className="mt-8 flex-1">
        <Reveal className="flex flex-col gap-2">
          {/* One row per rate tier, not per kind: the 9ft tables in hall 1 and the
              12ft ones in hall 2 are priced apart, and the size is what tells a
              guest which row their table is on. */}
          {(
            [
              ['9ft', m.table_rental_price(), '9ft'],
              ['12ft', m.table_rental_price(), '12ft'],
              ['darts', m.dartboard_rental_price(), null]
            ] as const
          ).map(([tier, title, size]) => (
            <div
              key={tier}
              className="flex items-center justify-between rounded-[10px] bg-club-green-light p-4"
            >
              <div>
                <p className="font-semibold text-creme">
                  {title}
                  {size ? <span className="text-golden"> {size}</span> : null}
                </p>
                <p className="text-xs text-grey-cool">{m.min_booking_note()}</p>
              </div>
              <p className="text-lg font-bold text-golden">
                {formatPln(rates[tier], intlTag())}{' '}
                <span className="text-sm font-medium text-creme/80">/ {m.per_hour()}</span>
              </p>
            </div>
          ))}

          <div className="rounded-[10px] bg-club-green-light p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="font-semibold text-creme">{m.partner_cards_title()}</p>
              <p className="shrink-0 text-lg font-bold text-golden">
                −{formatPln(SPORT_CARD_DISCOUNT_GROSZ, intlTag())}{' '}
                <span className="text-sm font-medium text-creme/80">{m.prices_per_card()}</span>
              </p>
            </div>
            <PartnerCardLogos className="mt-3" />
            <p className="mt-3 text-xs text-grey-cool">{m.sport_cards_hint()}</p>
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
