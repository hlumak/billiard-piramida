import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

export { AnimatePresence, m } from 'motion/react';

const loadFeatures = () => import('./features').then(mod => mod.default);

/**
 * App-wide motion setup: the dom renderer loads as a deferred chunk (`strict`
 * guarantees only `m.*` components are used), and `reducedMotion="user"`
 * disables transform/layout animation for people who ask the OS for less motion.
 *
 * Entrance-only components (Reveal/Stagger*) live in './index' as pure CSS and
 * don't need this context — it exists for AnimatePresence/m.* users (wizard
 * step transitions, tap feedback, admin).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
