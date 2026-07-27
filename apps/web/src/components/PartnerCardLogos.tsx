/**
 * The sport cards the club accepts, as a monochrome partner strip.
 *
 * Every logo is recoloured to creme: three partners in three different brand
 * palettes clash badly on club green, and a single-colour reversed treatment is
 * what each brand's own guidelines prescribe for dark backgrounds (Medicover
 * even ships it as their "negatyw" variant).
 *
 * FitProfit is set as type rather than artwork: fitprofit.pl is a suspended
 * domain and VanityStyle publishes no logo file, so there is nothing official
 * to ship. Swap in `partners/fitprofit.svg` and give it a `src` below once the
 * club gets the asset from their VanityStyle contact.
 */
const PARTNERS = [
  { name: 'MultiSport', src: '/partners/multisport.svg', width: 159, height: 34 },
  { name: 'Medicover Sport', src: '/partners/medicover-sport.svg', width: 209, height: 41 },
  { name: 'FitProfit', src: null, width: 0, height: 0 }
] as const;

export function PartnerCardLogos({ className }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${className ?? ''}`}>
      {PARTNERS.map(partner => (
        <li key={partner.name} className="flex items-center">
          {partner.src ? (
            <img
              src={partner.src}
              alt={partner.name}
              width={partner.width}
              height={partner.height}
              loading="lazy"
              className="h-5 w-auto opacity-90"
            />
          ) : (
            <span className="text-sm font-semibold tracking-tight text-creme/90">
              {partner.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
