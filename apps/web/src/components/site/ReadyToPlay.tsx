import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { m } from '../../paraglide/messages.js';

/** "Ready to play?": the closing call to book at the foot of an info page. */
export function ReadyToPlay({ className = '' }: { className?: string }) {
  return (
    <section
      className={`card flex flex-col gap-4.5 border-golden/40 p-6 md:flex-row md:items-center md:justify-between md:gap-8 md:rounded-3xl md:px-11 md:py-10 ${className}`}
    >
      <div>
        <h2 className="text-[22px] font-bold md:text-[28px]">{m.cta_ready_title()}</h2>
        <p className="mt-1.5 text-sm leading-normal text-cream-soft md:mt-2 md:text-base">
          {m.cta_ready_text()}
        </p>
      </div>
      <Link
        to="/book"
        className="btn-gold lift h-13.5 flex-none px-7.5 text-base whitespace-nowrap md:h-14"
      >
        {m.home_cta_book()}
        <ArrowRight aria-hidden className="size-5" strokeWidth={2.4} />
      </Link>
    </section>
  );
}
