/** All money amounts are integer grosze (1 PLN = 100 gr). */
export const HOURLY_RATE_GROSZ = 40_00;

export const CURRENCY = 'PLN';

export function tablePriceGrosz(durationHours: number): number {
  return durationHours * HOURLY_RATE_GROSZ;
}

export function formatPln(grosz: number, locale: Intl.LocalesArgument): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: grosz % 100 === 0 ? 0 : 2
  }).format(grosz / 100);
}
