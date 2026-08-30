import { useId, type ClipboardEvent, type ComponentType } from 'react';
import PhoneInput, {
  getCountryCallingCode,
  parsePhoneNumber,
  type Country,
  type Labels
} from 'react-phone-number-input';
import enLabels from 'react-phone-number-input/locale/en';
import plLabels from 'react-phone-number-input/locale/pl';
import ukLabels from 'react-phone-number-input/locale/ua';
import type { Locale } from '@repo/shared';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

/**
 * Phone entry with a country picker, so nobody has to know the dial code.
 * `react-phone-number-input` sits on the same libphonenumber-js metadata as
 * `@repo/shared/phone`, so what it emits is already the E.164 string the API
 * stores — `isValidPhone` still guards the submit.
 *
 * The country list is the library's native `<select>`: on a phone that opens
 * the OS picker (scrollable, searchable by keyboard) instead of a custom
 * popover, and it needs no styling work to stay accessible.
 */

/** The library ships country names per locale; `ua` is its code for Ukrainian. */
const LABELS: Record<Locale, Labels> = { uk: ukLabels, pl: plLabels, en: enLabels };

/** The list is a native `<select>`, so a divider can only be a hairline row. */
const DIVIDER_STYLE = { fontSize: '1px', backgroundColor: 'currentColor', color: 'inherit' };

interface CountrySelectProps {
  value?: Country;
  onChange: (country: Country | undefined) => void;
  options: { value?: Country; label: string; divider?: boolean }[];
  iconComponent: ComponentType<{ country?: Country; label: string; 'aria-hidden'?: boolean }>;
  disabled?: boolean;
  readOnly?: boolean;
}

/**
 * The library's own country select shows the flag alone. This is that markup
 * (same class names, so its stylesheet still applies) with the dial code
 * spelled out next to the flag — the invisible `<select>` covers the whole
 * chip, so the code is part of the click target rather than a separate control.
 */
function CountrySelectWithCode({
  value,
  onChange,
  options,
  iconComponent: Icon,
  disabled,
  readOnly,
  ...rest
}: CountrySelectProps) {
  const selected = options.find(option => !option.divider && option.value === value);

  return (
    <div className="PhoneInputCountry">
      <select
        {...rest}
        className="PhoneInputCountrySelect"
        // "ZZ" is the library's stand-in for "no country": every `<option/>`
        // needs a string value.
        value={value ?? 'ZZ'}
        onChange={event =>
          onChange(event.target.value === 'ZZ' ? undefined : (event.target.value as Country))
        }
        disabled={disabled || readOnly}
      >
        {options.map(({ value: country, label, divider }) => (
          <option
            key={divider ? '|' : (country ?? 'ZZ')}
            value={divider ? '|' : (country ?? 'ZZ')}
            disabled={divider}
            style={divider ? DIVIDER_STYLE : undefined}
          >
            {label}
          </option>
        ))}
      </select>
      {selected && value ? <Icon aria-hidden country={value} label={selected.label} /> : null}
      <div className="PhoneInputCountrySelectArrow" />
      {value ? (
        <span className="PhoneInputCountryCode">+{getCountryCallingCode(value)}</span>
      ) : null}
    </div>
  );
}

export function PhoneField({
  value,
  onChange,
  onBlur,
  name,
  isInvalid = false,
  errorMessage,
  isRequired = false
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
  name?: string | undefined;
  isInvalid?: boolean | undefined;
  errorMessage?: string | undefined;
  isRequired?: boolean | undefined;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const showError = isInvalid && errorMessage !== undefined;
  // The library declares these as plain optional props, and
  // `exactOptionalPropertyTypes` refuses an explicit `undefined` for those —
  // so leave them out entirely when there is nothing to pass.
  const optionalProps = { ...(value ? { value } : {}), ...(onBlur ? { onBlur } : {}) };

  /**
   * The input holds the national part only, so a pasted "+380…" would be read
   * as local digits of the currently selected country. Catch those pastes and
   * hand the number over as a value instead — the picker follows the value and
   * flips to the country the number belongs to.
   */
  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    const pasted = event.clipboardData.getData('text').trim();
    if (!pasted.startsWith('+') && !pasted.startsWith('00')) return;
    const parsed = parsePhoneNumber(pasted.replace(/^00/, '+'));
    if (parsed === undefined) return;
    event.preventDefault();
    onChange(parsed.number);
  };

  return (
    <div
      className="flex flex-col gap-1.5"
      data-invalid={isInvalid || undefined}
      onPaste={handlePaste}
    >
      <label htmlFor={id} className={`label${isRequired ? ' label--required' : ''}`}>
        {m.phone_label()}
      </label>
      <PhoneInput
        id={id}
        name={name}
        {...optionalProps}
        // The picker hands back `undefined` for an empty field; the forms all
        // keep a string, and an empty one is what their validators reject.
        onChange={next => onChange(next ?? '')}
        defaultCountry="PL"
        // Poland first (the club is there), then Ukraine, then everyone else.
        countryOptionsOrder={['PL', 'UA', '|', '...']}
        addInternationalOption={false}
        countrySelectComponent={CountrySelectWithCode}
        // Keep the input on the national part only: the dial code is already
        // shown by the picker, and a prefilled +380… would otherwise repeat it.
        international={false}
        labels={LABELS[getLocale()]}
        // Self-hosted (public/flags) rather than the library's default CDN —
        // one ~200-byte SVG for the selected country, no third-party request.
        flagUrl="/flags/{XX}.svg"
        limitMaxLength
        autoComplete="tel"
        numberInputProps={{
          placeholder: m.phone_placeholder(),
          'aria-invalid': isInvalid || undefined,
          'aria-describedby': showError ? errorId : undefined,
          'aria-required': isRequired || undefined
        }}
      />
      {showError ? (
        <p id={errorId} className="field-error" data-visible="true">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
