import { expect, test } from 'vitest';
import { AI_CRAWLERS, robotsTxt } from '../src/lib/robots';
import { SITE_URL } from '../src/lib/seo';

/** The rule groups of a robots.txt: blank-line separated, each a list of lines. */
const groups = (body: string) => body.split('\n\n').map(group => group.split('\n'));

test('AI crawlers are welcomed by name', () => {
  const body = robotsTxt();
  for (const agent of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User']) {
    expect(body).toContain(`User-agent: ${agent}\n`);
  }
  expect(AI_CRAWLERS).toContain('PerplexityBot');
  expect(AI_CRAWLERS).toContain('Google-Extended');
});

test('a named crawler gets the same rules as everyone: the private pages stay closed', () => {
  // A crawler that finds its own name ignores the "*" group, so the names
  // must sit in the one group that carries the rules
  const shared = groups(robotsTxt()).find(group => group.includes('User-agent: *'));
  for (const agent of AI_CRAWLERS) expect(shared).toContain(`User-agent: ${agent}`);
  expect(shared).toContain('Allow: /');
  expect(shared).toContain('Disallow: /admin');
  expect(shared).toContain('Disallow: /uk/profile');
  expect(shared).toContain('Disallow: /en/booking/');
  // Every agent line comes before the first rule, as the format requires
  const firstRule = shared?.findIndex(line => !line.startsWith('User-agent:')) ?? -1;
  expect(shared?.slice(firstRule).some(line => line.startsWith('User-agent:'))).toBe(false);
});

test('the sitemap is named with the real domain', () => {
  expect(robotsTxt()).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
});

test('a staging deploy closes the whole site to everyone', () => {
  expect(robotsTxt({ disallowAll: true })).toBe('User-agent: *\nDisallow: /\n');
});
