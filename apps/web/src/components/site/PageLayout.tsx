import type { ReactNode } from 'react';
import { BackToTop } from './BackToTop';
import { PageTitle } from './PageTitle';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

const WIDTHS = {
  narrow: 'max-w-[560px]',
  medium: 'max-w-[960px]',
  wide: 'max-w-[1240px]'
} as const;

/**
 * Every page except home: header, the script-and-caption title, the page's
 * own content in a centred column, the compact footer and "back to top". The
 * column is a flex child of a full-height page, so the footer always reaches
 * the bottom of the window.
 */
export function PageLayout({
  script,
  title,
  decorativeTitle = false,
  showTitle = true,
  width = 'wide',
  footer = true,
  children
}: {
  script: string;
  title: string;
  /** The page carries its own h1 further down (an article, a tournament) */
  decorativeTitle?: boolean;
  /** Off where the page opens with a heading of its own (a fresh booking's confirmation) */
  showTitle?: boolean;
  width?: keyof typeof WIDTHS;
  /** The booking flow drops the footer to keep the visitor on the task */
  footer?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      {showTitle ? (
        <PageTitle
          script={script}
          title={title}
          decorative={decorativeTitle}
          className="px-5 pt-8 md:pt-10"
        />
      ) : null}
      <main
        id="main"
        className={`mx-auto w-full px-5 pt-8 md:px-10 md:pt-12 ${WIDTHS[width]} ${footer ? '' : 'flex-1 pb-18'}`}
      >
        {children}
      </main>
      {footer ? <SiteFooter /> : null}
      <BackToTop />
    </div>
  );
}
