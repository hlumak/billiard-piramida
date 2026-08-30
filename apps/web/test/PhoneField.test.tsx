import { useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { isValidPhone } from '@repo/shared/phone';
import { PhoneField } from '../src/components/PhoneField';

/** Mirrors how the forms use the field: they own the E.164 string it emits. */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PhoneField value={value} onChange={setValue} name="phone" />
      <output data-testid="value">{value}</output>
    </>
  );
}

function parts(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="tel"]');
  const select = container.querySelector<HTMLSelectElement>('select');
  if (!input || !select) throw new Error('phone field did not render its controls');
  return { input, select };
}

afterEach(cleanup);

test('a local number typed without a dial code is stored as Polish E.164', () => {
  const { container, getByTestId } = render(<Harness />);
  const { input, select } = parts(container);

  expect(select.value).toBe('PL');

  fireEvent.change(input, { target: { value: '601234567' } });

  expect(getByTestId('value').textContent).toBe('+48601234567');
  expect(isValidPhone('+48601234567')).toBe(true);
});

test('picking another country re-codes the same digits', () => {
  const { container, getByTestId } = render(<Harness />);
  const { input, select } = parts(container);

  fireEvent.change(select, { target: { value: 'UA' } });
  fireEvent.change(input, { target: { value: '671234567' } });

  expect(getByTestId('value').textContent).toBe('+380671234567');
});

test('a stored foreign number opens on its own country and hides the dial code', () => {
  const { container } = render(<Harness initial="+380671234567" />);
  const { input, select } = parts(container);

  expect(select.value).toBe('UA');
  // The dial code lives in the picker, so the input shows the number the way
  // it is written locally (UA keeps its "0" trunk prefix) and never a "+".
  expect(input.value).not.toContain('+');
  expect(input.value.replace(/\D/g, '')).toBe('0671234567');
});

test('pasting a full international number switches the country', () => {
  const { container, getByTestId } = render(<Harness />);
  const { input, select } = parts(container);

  fireEvent.paste(input, { clipboardData: { getData: () => '+380 67 123 4567' } });

  expect(select.value).toBe('UA');
  expect(getByTestId('value').textContent).toBe('+380671234567');
});

test('the picked country shows its dial code next to the flag', () => {
  const { container } = render(<Harness />);
  const { select } = parts(container);
  const code = () => container.querySelector('.PhoneInputCountryCode')?.textContent;

  expect(code()).toBe('+48');

  fireEvent.change(select, { target: { value: 'UA' } });
  expect(code()).toBe('+380');
});

test('the country list leads with Poland and Ukraine', () => {
  const { container } = render(<Harness />);
  const { select } = parts(container);
  const options = [...select.options].map(option => option.value);

  expect(options.slice(0, 2)).toEqual(['PL', 'UA']);
  expect(options.length).toBeGreaterThan(200);
});
