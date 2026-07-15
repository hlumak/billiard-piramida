import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * Phone handling (libphonenumber-js): the venue is in Poland, so numbers
 * without a country code are treated as Polish; anything with +CC is
 * validated for its own country (Ukrainian +380 guests included).
 *
 * Exposed via the separate `@repo/shared/phone` entry so the metadata bundle
 * is only loaded by screens that actually validate phones.
 */

const DEFAULT_COUNTRY = 'PL';

/** Validate and normalize to E.164 ("+48601234567"); null when invalid. */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), DEFAULT_COUNTRY);
  return parsed?.isValid() ? parsed.number : null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/** Human-readable international format ("+48 601 234 567") for display. */
export function formatPhone(stored: string): string {
  return parsePhoneNumberFromString(stored, DEFAULT_COUNTRY)?.formatInternational() ?? stored;
}
