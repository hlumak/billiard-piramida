/**
 * Brand lockup (emblem + "PIRAMIDA / KLUB BILARDOWY"), gold + creme for the
 * club-green surfaces.
 *
 * Referenced as a file rather than inlined: the wordmark is ~550 outlined
 * curves (~15 KB) and inlining would repeat that in the SSR payload of every
 * page, where a single cached request covers all of them.
 */
export function BrandLogo({
  className,
  priority = false
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src="/logo.svg"
      // Where the logo is the largest thing above the fold (home, menu) it is
      // the LCP element: fetch it ahead of the scripts and fonts
      fetchPriority={priority ? 'high' : undefined}
      alt="Piramida — klub bilardowy"
      width={1016}
      height={551}
      className={className}
    />
  );
}
