import { useDeferredValue, useId, useMemo, useState, type ClipboardEvent } from 'react';
import {
  Autocomplete,
  Collection,
  Header,
  ListBox,
  ListLayout,
  SearchField,
  useFilter,
  Virtualizer
} from '@heroui/react';
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
 * The country list is the club's own picker (HeroUI Autocomplete, so React
 * Aria's select pattern: keyboard, focus and screen readers), with a search
 * field that takes a country name or a dial code. It replaced the library's
 * native `<select>`, which Windows drew as a plain list with a full-height
 * cream bar where the 1px divider was meant to be, and no dial codes.
 */

/** The library ships country names per locale; `ua` is its code for Ukrainian. */
const LABELS: Record<Locale, Labels> = { uk: ukLabels, pl: plLabels, en: enLabels };

interface CountrySelectProps {
  value?: Country;
  onChange: (country: Country | undefined) => void;
  options: { value?: Country; label: string; divider?: boolean }[];
  disabled?: boolean;
  readOnly?: boolean;
}

/** Self-hosted (public/flags), loaded only as rows scroll into view. */
function Flag({ country, className = '' }: { country: Country; className?: string }) {
  return (
    <img
      src={`/flags/${country}.svg`}
      alt=""
      width={20}
      height={14}
      loading="lazy"
      className={`h-3.5 w-5 flex-none rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.25)] ${className}`}
    />
  );
}

/** One country as the list shows it and the search reads it. */
interface CountryItem {
  id: Country;
  label: string;
  code: string;
}

interface CountrySection {
  id: 'common' | 'all';
  title: string;
  items: CountryItem[];
}

/** Row and heading heights the virtual list lays out with; the CSS below matches them. */
const ROW_HEIGHT = 36;
const HEADING_HEIGHT = 30;
/** Nine rows and a heading, then the list scrolls. */
const LIST_MAX_HEIGHT = 9 * ROW_HEIGHT + HEADING_HEIGHT;
const LIST_PADDING = 6;

function CountryRow({ item }: { item: CountryItem }) {
  return (
    // textValue carries the dial code too, so a screen reader reads both
    <ListBox.Item
      id={item.id}
      textValue={`${item.label} +${item.code}`}
      className="h-9 min-h-9 gap-2.5 py-0"
    >
      <Flag country={item.id} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <span className="text-sm text-grey-cool tabular-nums">+{item.code}</span>
      <ListBox.ItemIndicator />
    </ListBox.Item>
  );
}

/**
 * Takes the library's options as they come: Poland and Ukraine, a divider,
 * then every country sorted for the visitor's language. The two before the
 * divider become their own section at the top.
 *
 * The list is virtual (React Aria's Virtualizer): only the rows in view are
 * rendered. Rendering all 245 rows and their flags on every open and every
 * keystroke made the picker visibly slow — 150–450 ms to open on a desktop.
 */
function CountryPicker({ value, onChange, options, disabled, readOnly }: CountrySelectProps) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [query, setQuery] = useState('');
  // The search box shows each letter at once; the list follows a beat later,
  // so typing stays smooth on a slow phone while the list rebuilds
  const deferredQuery = useDeferredValue(query);

  const sections = useMemo(() => {
    const split = options.findIndex(option => option.divider);
    const toItems = (list: typeof options): CountryItem[] =>
      list.flatMap(option =>
        option.value === undefined
          ? []
          : [{ id: option.value, label: option.label, code: getCountryCallingCode(option.value) }]
      );
    const all: CountrySection[] = [
      {
        id: 'common',
        title: m.phone_country_common(),
        items: toItems(split < 0 ? [] : options.slice(0, split))
      },
      {
        id: 'all',
        title: m.phone_country_all(),
        items: toItems(split < 0 ? options : options.slice(split + 1))
      }
    ];
    // "+48" and "48" both find Poland; a name matches without diacritics
    const needle = deferredQuery.trim().replace(/^\+/, '');
    return all
      .map(section => ({
        id: section.id,
        title: section.title,
        items: needle
          ? section.items.filter(item => contains(`${item.label} +${item.code}`, needle))
          : section.items
      }))
      .filter(section => section.items.length > 0);
  }, [options, deferredQuery, contains]);

  // The virtual list needs a definite height: as tall as its rows, up to the cap
  const rows = sections.reduce((sum, section) => sum + section.items.length, 0);
  const listHeight = Math.min(
    LIST_MAX_HEIGHT,
    rows * ROW_HEIGHT + sections.length * HEADING_HEIGHT + 2 * LIST_PADDING
  );

  return (
    <Autocomplete
      aria-label={m.phone_country_label()}
      value={value ?? null}
      onChange={key => {
        if (typeof key === 'string') onChange(key as Country);
      }}
      onOpenChange={open => {
        if (!open) setQuery('');
      }}
      isDisabled={disabled === true || readOnly === true}
      allowsEmptyCollection
      // HeroUI's root is a top-aligned column; centred, the flag and the code
      // sit on the same line as the number beside them
      className="PhoneInputCountry justify-center"
    >
      {/* Bare inside the phone field: the field's own box is the wrapper's.
          The right padding is the chevron's place (HeroUI positions it there). */}
      <Autocomplete.Trigger className="h-auto min-h-0 gap-1.5 rounded-md border-0 bg-transparent py-0 ps-0 pe-5 shadow-none hover:bg-transparent data-[focus-visible=true]:outline-2 data-[focus-visible=true]:outline-offset-2 data-[focus-visible=true]:outline-golden">
        <Autocomplete.Value className="flex items-center gap-1.5">
          {() =>
            value ? (
              <>
                <Flag country={value} />
                <span className="PhoneInputCountryCode">+{getCountryCallingCode(value)}</span>
              </>
            ) : null
          }
        </Autocomplete.Value>
        <Autocomplete.Indicator className="end-0 size-3.5 text-grey-cool" />
      </Autocomplete.Trigger>
      <Autocomplete.Popover
        placement="bottom start"
        // HeroUI sizes it to the trigger (here only the flag and code chip)
        className="w-[min(22rem,calc(100vw-2.5rem))] max-w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-line bg-club-green-dark p-0 text-creme shadow-[0_18px_44px_rgb(0_0_0/0.45)]"
      >
        <Autocomplete.Filter inputValue={query} onInputChange={setQuery}>
          <div className="border-b border-line p-2.5">
            <SearchField autoFocus aria-label={m.phone_country_search()} name="country-search">
              <SearchField.Group className="rounded-xl bg-club-green-light">
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={m.phone_country_search()} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
          <Virtualizer
            layout={ListLayout}
            layoutOptions={{
              rowHeight: ROW_HEIGHT,
              headingHeight: HEADING_HEIGHT,
              padding: LIST_PADDING
            }}
          >
            <ListBox
              aria-label={m.phone_country_label()}
              items={sections}
              style={{ height: rows === 0 ? undefined : listHeight }}
              className="overflow-y-auto px-1.5"
              renderEmptyState={() => (
                <p className="px-3 py-4 text-center text-sm text-grey-cool">
                  {m.phone_country_none()}
                </p>
              )}
            >
              {section => (
                <ListBox.Section id={section.id}>
                  <Header className="flex h-7.5 items-end px-2.5 pb-1 text-xs font-bold text-golden-light">
                    {section.title}
                  </Header>
                  <Collection items={section.items}>
                    {item => <CountryRow item={item} />}
                  </Collection>
                </ListBox.Section>
              )}
            </ListBox>
          </Virtualizer>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
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
        countrySelectComponent={CountryPicker}
        // Keep the input on the national part only: the dial code is already
        // shown by the picker, and a prefilled +380… would otherwise repeat it.
        international={false}
        labels={LABELS[getLocale()]}
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
