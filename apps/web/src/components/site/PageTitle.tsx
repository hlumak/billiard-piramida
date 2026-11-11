/**
 * The page title: the page's name in the visitor's language, set in the
 * club's script (Great Vibes ships Latin, Polish and Cyrillic glyphs).
 *
 * It used to be an English script word ("news", "prices") over the real
 * name in small spaced capitals between gold rules, so the biggest word on a
 * Polish or Ukrainian page was in a language the visitor had not chosen. A
 * page whose real heading lives further down (a news article, a tournament)
 * passes `decorative`, and the title becomes a paragraph so the page keeps
 * one h1.
 */
export function PageTitle({
  title,
  decorative = false,
  align = 'center',
  className
}: {
  title: string;
  decorative?: boolean;
  align?: 'center' | 'start';
  className?: string;
}) {
  const Heading = decorative ? 'p' : 'h1';
  return (
    <div className={`anim-rise ${align === 'center' ? 'text-center' : ''} ${className ?? ''}`}>
      <Heading className="font-script text-[52px] leading-[1.15] text-balance text-golden md:text-[76px]">
        {title}
      </Heading>
    </div>
  );
}

/** Section heading on long pages: the same script, a size down. */
export function SectionTitle({ title, id }: { title: string; id?: string }) {
  return (
    <h2 id={id} className="font-script text-[44px] leading-[1.15] text-golden md:text-[58px]">
      {title}
    </h2>
  );
}
