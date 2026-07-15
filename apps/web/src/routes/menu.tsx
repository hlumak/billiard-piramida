import { Link, createFileRoute } from '@tanstack/react-router';
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
  return (
    <div className="relative min-h-dvh overflow-hidden bg-club-green">
      <img
        src="/hero-bg-mobile.webp"
        srcSet="/hero-bg-mobile.webp 428w, /hero-bg-desktop.webp 752w"
        sizes="100vw"
        alt=""
        width={376}
        height={768}
        loading="lazy"
        className="absolute inset-0 size-full object-cover opacity-40 blur-sm"
      />
      <div className="absolute inset-0 bg-club-green/70" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-10 pb-10 pt-16">
        <Reveal className="flex justify-center">
          <Link to="/" className="brand-title text-4xl leading-none">
            piramida
          </Link>
        </Reveal>

        <StaggerGroup className="mt-[26dvh]">
          <nav className="flex flex-col gap-5">
            <StaggerItem>
              <ButtonLink to="/book">{m.menu_booking()}</ButtonLink>
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

        <Reveal delay={0.3} className="mt-auto">
          <LocaleSwitcher />
        </Reveal>
      </div>
    </div>
  );
}
