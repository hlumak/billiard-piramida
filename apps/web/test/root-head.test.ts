import { expect, test } from 'vitest';
import { Route } from '../src/routes/__root';

test('the document declares its one dark scheme before any stylesheet loads', async () => {
  // Without it a browser takes the page for a light one: white scrollbars and
  // black native-control glyphs on the green
  const head = await Route.options.head?.({} as never);
  expect(head?.meta).toContainEqual({ name: 'color-scheme', content: 'dark' });
});

test('the document points agents at llms.txt instead of leaving them to guess the path', async () => {
  const head = await Route.options.head?.({} as never);
  expect(head?.links).toContainEqual({
    rel: 'describedby',
    href: '/llms.txt',
    type: 'text/markdown'
  });
});
