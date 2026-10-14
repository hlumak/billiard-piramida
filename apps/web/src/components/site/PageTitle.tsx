/**
 * The page title lockup: the club's script word on top, the page's name in the
 * visitor's language under it between two gold rules — the same "— KLUB
 * BILARDOWY —" motif as the logo.
 *
 * The script word is Latin-only by design (Great Vibes), so it stays English in
 * every locale, is marked as English and is hidden from assistive tech: the
 * localized caption is what gets read. A page whose real heading lives further
 * down (a news article, a tournament) passes `decorative`, and the caption
 * becomes a paragraph so the page keeps one h1.
 */
export function PageTitle({
  script,
  title,
  decorative = false,
  align = 'center',
  className
}: {
  script: string;
  title: string;
  decorative?: boolean;
  align?: 'center' | 'start';
  className?: string;
}) {
  const Caption = decorative ? 'p' : 'h1';
  const centred = align === 'center';
  return (
    <div className={`anim-reveal ${centred ? 'text-center' : ''} ${className ?? ''}`}>
      <p
        lang="en"
        aria-hidden
        className="font-script text-6xl leading-none text-golden md:text-[76px]"
      >
        {script}
      </p>
      <Caption
        className={`mt-3 inline-flex items-center gap-3.5 text-[13px] font-bold uppercase tracking-[0.24em] text-cream-soft md:text-sm`}
      >
        <span aria-hidden className="h-[3px] w-7 rounded-sm bg-golden" />
        {title}
        {centred ? <span aria-hidden className="h-[3px] w-7 rounded-sm bg-golden" /> : null}
      </Caption>
    </div>
  );
}

/** Section heading on long pages: smaller script word, caption with a lead rule. */
export function SectionTitle({
  script,
  title,
  id
}: {
  script: string;
  title: string;
  id?: string;
}) {
  return (
    <div>
      <p
        lang="en"
        aria-hidden
        className="font-script text-[46px] leading-none text-golden md:text-6xl"
      >
        {script}
      </p>
      <h2
        id={id}
        className="mt-2.5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-cream-soft md:text-sm"
      >
        <span aria-hidden className="h-[3px] w-6 rounded-sm bg-golden md:w-7" />
        {title}
      </h2>
    </div>
  );
}
