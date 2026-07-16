import type { Variants } from 'motion/react';

/* Shared variants: parents set `hidden`/`visible`, children inherit the timing.
 * Kept out of index.tsx so the component file only exports components
 * (Fast Refresh can then preserve state on edits). */

export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045 } }
};

export const fadeUpChild: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } }
};

/** Tap feedback for chip-style buttons. */
export const tapScale = { scale: 0.95 } as const;
