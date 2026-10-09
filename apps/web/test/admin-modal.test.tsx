import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { AdminDishModal } from '../src/components/admin/AdminDishModal';
import { m } from '../src/paraglide/messages.js';

function renderModal() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminDishModal item={null} />
    </QueryClientProvider>
  );
}

afterEach(cleanup);

test('the editor keeps a changed draft on Escape and releases its trigger on close', async () => {
  renderModal();
  const trigger = screen.getByRole('button', { name: m.admin_add_dish() });

  await act(async () => fireEvent.click(trigger));
  const dialog = screen.getByRole('dialog');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');

  // Untouched: Escape closes as usual
  await act(async () => fireEvent.keyDown(dialog, { key: 'Escape' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger.getAttribute('aria-expanded')).not.toBe('true');

  // With a change pending, Escape no longer throws the draft away
  await act(async () => fireEvent.click(trigger));
  const price = screen.getAllByRole('textbox')[0];
  if (!price) throw new Error('no text field in the editor');
  await act(async () => fireEvent.change(price, { target: { value: '12' } }));
  await act(async () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }));
  expect(screen.queryByRole('dialog')).not.toBeNull();

  // The close button still closes it, and the trigger is not left expanded
  const close = screen
    .getAllByRole('button')
    .find(
      button =>
        screen.getByRole('dialog').contains(button) &&
        /close/i.test(button.getAttribute('aria-label') ?? '')
    );
  if (!close) throw new Error('no close button');
  await act(async () => fireEvent.click(close));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger.getAttribute('aria-expanded')).not.toBe('true');
});
