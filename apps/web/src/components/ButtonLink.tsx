import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

const VARIANTS = {
  primary: 'bg-golden text-btn-text hover:bg-golden-hover text-lg font-bold',
  outline: 'border border-golden text-creme hover:bg-golden/10 text-lg font-semibold'
} as const;

/**
 * Navigation styled as a Figma CTA button (45px, radius 10). Real links, so
 * open-in-new-tab and assistive tech work — unlike Button + navigate().
 */
export function ButtonLink({
  to,
  variant = 'primary',
  children
}: {
  to: string;
  variant?: keyof typeof VARIANTS;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`flex h-[45px] w-full items-center justify-center rounded-[10px] transition-colors ${VARIANTS[variant]}`}
    >
      {children}
    </Link>
  );
}
