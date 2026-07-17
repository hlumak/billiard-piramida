import type { ReactNode } from 'react';

/* Entrance components are pure CSS (see styles.css `fade-up-in`) and this
 * module must NOT import 'motion/react': most routes only fade content in,
 * and a JS runtime would hold SSR-rendered content invisible until hydration.
 * Components that need real JS animation (AnimatePresence, m.*, whileTap)
 * import from './provider' instead. */

/** One-off entrance for a standalone block. */
export function Reveal({
  children,
  delay = 0,
  className
}: {
  children: ReactNode;
  delay?: number;
  className?: string | undefined;
}) {
  return (
    <div
      className={className ? `anim-reveal ${className}` : 'anim-reveal'}
      style={delay > 0 ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}

/** Wrap a list/grid: children marked with StaggerItem cascade in. */
export function StaggerGroup({
  children,
  className
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return <div className={className}>{children}</div>;
}

/** Cascades by sibling position (nth-child), so items must be siblings. */
export function StaggerItem({
  children,
  className
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={className ? `anim-stagger-item ${className}` : 'anim-stagger-item'}>
      {children}
    </div>
  );
}
