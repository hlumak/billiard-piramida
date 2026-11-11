import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { BotCheck } from '../src/lib/bot-check';

// Turnstile is ~2 MB from Cloudflare: a form people mostly scroll past must
// not fetch it until the guest starts on it.

const turnstileScripts = () =>
  document.head.querySelectorAll('script[src^="https://challenges.cloudflare.com/"]');

beforeEach(() => {
  // The site key is read when the module loads, so stub it before importing
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key');
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  for (const script of turnstileScripts()) script.remove();
});

async function renderForm(lazy: boolean) {
  const { BotCheckWidget } = await import('../src/components/BotCheckWidget');
  const { useBotCheck } = await import('../src/lib/bot-check');
  let check: BotCheck | undefined;
  function Form() {
    check = useBotCheck('tournament');
    return (
      <form>
        <input aria-label="Name" />
        <BotCheckWidget check={check} lazy={lazy} />
      </form>
    );
  }
  const view = render(<Form />);
  return { ...view, check: () => check! };
}

test('a lazy widget loads Turnstile only once the guest starts on the form', async () => {
  const { getByLabelText } = await renderForm(true);
  expect(turnstileScripts()).toHaveLength(0);
  fireEvent.focusIn(getByLabelText('Name'));
  expect(turnstileScripts()).toHaveLength(1);
  // Later interactions don't load it again
  fireEvent.input(getByLabelText('Name'));
  expect(turnstileScripts()).toHaveLength(1);
});

test('a lazy form sent before it was touched still starts the check', async () => {
  const { check } = await renderForm(true);
  expect(turnstileScripts()).toHaveLength(0);
  void check().token();
  expect(turnstileScripts()).toHaveLength(1);
});

test('a widget that is not lazy loads Turnstile right away', async () => {
  await renderForm(false);
  expect(turnstileScripts()).toHaveLength(1);
});
