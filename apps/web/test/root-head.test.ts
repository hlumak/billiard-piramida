import { expect, test } from 'vitest';
import { Route } from '../src/routes/__root';

test('the document declares its one dark scheme before any stylesheet loads', () => {
  // Without it a browser takes the page for a light one: white scrollbars and
  // black native-control glyphs on the green
  const head = Route.options.head?.({} as never);
  expect(head?.meta).toContainEqual({ name: 'color-scheme', content: 'dark' });
});
