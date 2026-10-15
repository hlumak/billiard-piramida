import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { m } from '../../paraglide/messages.js';

/**
 * A gold "back to top" button that shows up once the visitor is well down a
 * long page — past half of what there is to scroll, on a page at least two
 * screens tall — and glides back to the top. Short pages never show it.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setVisible(scrollable > window.innerHeight && window.scrollY > scrollable * 0.5);
    };
    // rAF-coalesced: a fling fires dozens of scroll events per frame
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <button
      type="button"
      aria-label={m.back_to_top()}
      // Out of the tab order while it is hidden, so keyboard users never land on it
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth'
        })
      }
      className={`btn-gold fixed right-4 bottom-6 z-30 size-13 rounded-full shadow-[0_12px_28px_rgb(0_0_0/0.35)] transition-[opacity,translate,scale,background-color] duration-300 md:right-8 md:bottom-8 md:size-14 ${
        visible ? 'opacity-100' : 'pointer-events-none translate-y-6 scale-80 opacity-0'
      }`}
    >
      <ArrowUp className="size-6" strokeWidth={2.6} aria-hidden />
    </button>
  );
}
