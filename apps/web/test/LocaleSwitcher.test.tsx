import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { LocaleSwitcher } from '../src/components/LocaleSwitcher';
import { LOCALE_CHOICE_COOKIE } from '../src/lib/locale-choice';

// Switching loads the page anew in the other language, which jsdom cannot do:
// the navigation is the one thing replaced here
const setLocale = vi.hoisted(() => vi.fn());
vi.mock('../src/paraglide/runtime.js', async original => ({
  ...(await original<typeof import('../src/paraglide/runtime.js')>()),
  setLocale
}));
window.scrollTo = () => {};

afterEach(() => {
  setLocale.mockClear();
  cleanup();
  document.cookie = `${LOCALE_CHOICE_COOKIE}=; path=/; max-age=0`;
});

async function renderSwitcher() {
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <LocaleSwitcher />
  });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  render(<RouterProvider router={router} />);
  return screen.findByRole('group');
}

test('each language is a real link to this page in that language', async () => {
  await renderSwitcher();
  expect(screen.getByRole('link', { name: /English/ }).getAttribute('href')).toBe('/en/');
  expect(screen.getByRole('link', { name: /Українська/ }).getAttribute('href')).toBe('/uk/');
  expect(screen.getByRole('link', { name: /Polski/ }).getAttribute('aria-current')).toBe('true');
});

test('showing the switcher remembers nothing; picking a language does', async () => {
  await renderSwitcher();
  expect(document.cookie).toBe('');
  fireEvent.click(screen.getByRole('link', { name: /English/ }));
  expect(document.cookie).toBe(`${LOCALE_CHOICE_COOKIE}=en`);
  expect(setLocale).toHaveBeenCalledWith('en');
});

test('opening a language in a new tab is not a choice', async () => {
  await renderSwitcher();
  const link = screen.getByRole('link', { name: /Українська/ });
  // The browser opens the tab itself; jsdom would try to navigate this one
  link.addEventListener('click', event => event.preventDefault());
  fireEvent.click(link, { ctrlKey: true });
  expect(document.cookie).toBe('');
  expect(setLocale).not.toHaveBeenCalled();
});
