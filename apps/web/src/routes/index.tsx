import { createFileRoute } from '@tanstack/react-router';
import { hoursForDate } from '@repo/shared';
import { HomeHeader } from '../components/AppHeader';
import { Reveal } from '../components/motion';
import { ButtonLink } from '../components/ButtonLink';
import { formatHour, warsawToday } from '../lib/format';
import { pageMeta, venueJsonLd } from '../lib/seo';
import { m } from '../paraglide/messages.js';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: pageMeta(m.app_title(), m.seo_desc_home()),
    scripts: [{ type: 'application/ld+json', children: venueJsonLd() }]
  }),
  component: Home
});

function Home() {
  const { open, close } = hoursForDate(warsawToday());

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <picture>
        {/* Select by viewport width (device class), not resolution: high-DPR
            phones would otherwise pull the wide desktop crop via `w` descriptors. */}
        <source media="(min-width: 768px)" srcSet="/hero-bg-desktop.webp" />
        <img
          src="/hero-bg-mobile.webp"
          alt=""
          width={376}
          height={768}
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/10 to-black/50" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-[18dvh] pt-14 md:max-w-3xl md:pt-16">
        <Reveal>
          <HomeHeader />
        </Reveal>

        <Reveal delay={0.15} className="mt-auto flex flex-col items-center gap-3">
          <div className="w-full max-w-74">
            <ButtonLink to="/book">{m.book_now()}</ButtonLink>
          </div>
          <p className="text-sm text-creme/80">
            {m.open_today({ open: formatHour(open), close: formatHour(close) })}
          </p>
        </Reveal>
      </div>
    </div>
  );
}
