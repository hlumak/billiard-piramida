import type { ReactNode } from 'react';

/* All animation in this app is pure CSS (see styles.css: fade-up-in,
 * step-in-*, pop-in) — a JS animation runtime held SSR-rendered content
 * invisible until hydration and dropped frames when step transitions raced
 * data fetches. Step changes are enter-only: remount with a key and the
 * keyframe replays; exiting content just unmounts. Tap feedback is
 * `active:scale-*` with a transform transition. */

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
