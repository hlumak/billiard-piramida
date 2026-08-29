import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { BrandLogo } from '../components/BrandLogo';
import { ButtonLink } from '../components/ButtonLink';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
import { Reveal, StaggerGroup, StaggerItem } from '../components/motion';
import { m } from '../paraglide/messages.js';
import { pageMeta } from '../lib/seo';

export const Route = createFileRoute('/menu')({
  head: () => ({ meta: pageMeta(m.seo_title_menu(), m.seo_desc_menu()) }),
  component: MenuPage
});

function MenuPage() {
  const navigate = useNavigate();

  return (
    // Pointer-only backdrop convenience: tapping empty space closes the menu.
    // Every real target inside is a native link, so this wrapper needs no role.
    // oxlint-disable-next-line react-doctor/no-static-element-interactions
    <div
      className="relative min-h-dvh overflow-hidden bg-club-green"
      onClick={event => {
        if ((event.target as HTMLElement).closest('a, button')) return;
        navigate({ to: '/' });
      }}
    >
      <picture>
        {/* Select by viewport width (device class), not resolution: high-DPR
            phones would otherwise pull the wide desktop crop via `w` descriptors.
            Dedicated 960w asset: this backdrop is blurred + dimmed anyway, and
            CSS-blurring the full-res hero cost real GPU time on weak devices. */}
        <source media="(min-width: 768px)" srcSet="/hero-bg-menu.webp" />
        <img
          src="/hero-bg-mobile.webp"
          alt=""
          width={376}
          height={768}
          loading="lazy"
          className="absolute inset-0 size-full object-cover opacity-40 blur-sm"
        />
      </picture>
      <div className="absolute inset-0 bg-club-green/70" />

      {/* Sized to the viewport rather than min-sized by it, so the gap below the
          logo is a flex item that can yield. Scrolls only if even a collapsed
          gap is not enough (a phone held sideways), which beats clipping. */}
      <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-y-auto px-10 pb-10 pt-16">
        <Reveal className="flex shrink-0 justify-center">
          <Link to="/">
            <BrandLogo className="w-44" />
          </Link>
        </Reveal>

        {/* The design drops the nav well down the page, but that space is the
            first thing to give on a short screen: as a fixed margin it did not,
            and the language row ended up sitting on the last button. */}
        <div aria-hidden className="h-[26dvh] shrink" />

        <StaggerGroup className="shrink-0">
          <nav className="flex flex-col gap-5">
            <StaggerItem>
              <ButtonLink to="/book">{m.menu_booking()}</ButtonLink>
            </StaggerItem>
            <StaggerItem>
              <ButtonLink to="/bookings" variant="outline">
                {m.nav_my_bookings()}
              </ButtonLink>
            </StaggerItem>
            <StaggerItem>
              <ButtonLink to="/tournaments" variant="outline">
                {m.menu_tournaments()}
              </ButtonLink>
            </StaggerItem>
            <StaggerItem>
              <ButtonLink to="/contacts" variant="outline">
                {m.menu_contacts()}
              </ButtonLink>
            </StaggerItem>
            <StaggerItem>
              <ButtonLink to="/prices" variant="outline">
                {m.menu_prices()}
              </ButtonLink>
            </StaggerItem>
          </nav>
        </StaggerGroup>

        {/* pt-8 is the floor: mt-auto contributes nothing once the screen is
            full, and the row must still clear the button above it. */}
        <Reveal delay={0.3} className="mt-auto shrink-0 pt-8">
          <LocaleSwitcher />
        </Reveal>
      </div>
    </div>
  );
}
