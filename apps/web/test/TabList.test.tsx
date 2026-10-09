import { useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { TabList, tabId, tabPanelId } from '../src/components/TabList';

const TABS = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' }
] as const;

function Harness() {
  const [selected, setSelected] = useState<'a' | 'b' | 'c'>('a');
  return (
    <>
      <TabList idBase="t" tabs={TABS} selected={selected} onSelect={setSelected} />
      <div role="tabpanel" id={tabPanelId('t')} aria-labelledby={tabId('t', selected)}>
        {selected}
      </div>
    </>
  );
}

afterEach(cleanup);

test('one tab stop; arrows move focus without selecting; Enter/click selects', () => {
  const { getAllByRole, getByRole } = render(<Harness />);
  const [alpha, beta, gamma] = getAllByRole('tab');
  if (!alpha || !beta || !gamma) throw new Error('tabs missing');

  expect(getAllByRole('tab').map(tab => tab.tabIndex)).toEqual([0, -1, -1]);
  expect(alpha.getAttribute('aria-controls')).toBe(tabPanelId('t'));
  expect(beta.getAttribute('aria-controls')).toBeNull();

  alpha.focus();
  fireEvent.keyDown(alpha, { key: 'ArrowLeft' });
  expect(document.activeElement).toBe(gamma); // wraps around
  fireEvent.keyDown(gamma, { key: 'Home' });
  expect(document.activeElement).toBe(alpha);
  fireEvent.keyDown(alpha, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(beta);
  // Manual activation: focus moved, the selection did not
  expect(alpha.getAttribute('aria-selected')).toBe('true');

  fireEvent.click(beta);
  expect(beta.getAttribute('aria-selected')).toBe('true');
  expect(beta.tabIndex).toBe(0);
  expect(getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(beta.id);
});
