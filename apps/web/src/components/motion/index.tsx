import { LazyMotion, MotionConfig, m } from 'motion/react';
import type { ReactNode } from 'react';
import { fadeUpChild, staggerParent } from './variants';

export { AnimatePresence, m } from 'motion/react';

const loadFeatures = () => import('./features').then(mod => mod.default);

/**
 * App-wide motion setup: the dom renderer loads as a deferred chunk (`strict`
 * guarantees only `m.*` components are used), and `reducedMotion="user"`
 * disables transform/layout animation for people who ask the OS for less motion.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

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
    <m.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
    >
      {children}
    </m.div>
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
  return (
    <m.div className={className} variants={staggerParent} initial="hidden" animate="visible">
      {children}
    </m.div>
  );
}

export function StaggerItem({
  children,
  className
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <m.div className={className} variants={fadeUpChild}>
      {children}
    </m.div>
  );
}
