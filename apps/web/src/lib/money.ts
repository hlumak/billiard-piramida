/** Most the API accepts for a dish price or an entry fee, in grosze. */
export const MAX_PRICE_GROSZ = 1_000_00;

/**
 * A złoty amount as staff type it ("25", "25,50", "25.5") in grosze, or null
 * when it is blank, not a number, negative or above `maxGrosz`.
 *
 * Blank must be null, not 0: `Number('')` is 0, which used to save an
 * untouched price field as a free dish — or a free table rate.
 */
export function parseZloty(input: string, maxGrosz: number = MAX_PRICE_GROSZ): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  const grosz = Math.round(value * 100);
  return grosz <= maxGrosz ? grosz : null;
}
