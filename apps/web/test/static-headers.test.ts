import { expect, test } from 'vitest';
import { noSniff } from '../static-headers.mjs';

const script = () =>
  new Response('export {}', {
    headers: { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=60' }
  });

test('a static file is served with nosniff, its own headers intact', async () => {
  const response = await noSniff(new Request('https://club.example/assets/app.js'), script);
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-type')).toBe('text/javascript');
  expect(response.headers.get('cache-control')).toBe('public, max-age=60');
  expect(await response.text()).toBe('export {}');
});

test('a response whose headers cannot be changed is still answered with nosniff', async () => {
  // What fetch() hands back, and what a static handler is free to return
  const frozen = () => Response.redirect('https://club.example/prices', 308);
  const response = await noSniff(new Request('https://club.example/prices/'), frozen);
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe('https://club.example/prices');
});
