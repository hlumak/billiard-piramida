import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadConfig } from '../src/lib/config.ts';

const SAVED = { ...process.env };
const STRONG = 'x'.repeat(40);

afterEach(() => {
  process.env = { ...SAVED };
});

function env(vars: Record<string, string | undefined>) {
  process.env = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value;
  }
}

test('production refuses placeholder or short secrets', () => {
  env({ NODE_ENV: 'production', ADMIN_TOKEN: 'change-me', JWT_SECRET: STRONG });
  assert.throws(() => loadConfig(), /ADMIN_TOKEN is still the \.env\.example placeholder/);

  env({ NODE_ENV: 'production', ADMIN_TOKEN: STRONG, JWT_SECRET: 'too-short' });
  assert.throws(() => loadConfig(), /JWT_SECRET is shorter than 32/);

  env({ NODE_ENV: 'production', ADMIN_TOKEN: STRONG, JWT_SECRET: STRONG });
  assert.doesNotThrow(() => loadConfig());
});

test('outside production weak secrets only warn', () => {
  env({ ADMIN_TOKEN: 'change-me' });
  const warnings: string[] = [];
  const config = loadConfig(message => warnings.push(message));
  assert.equal(config.adminToken, 'change-me');
  assert.equal(warnings.length, 1);
});

test('CORS: listed origins, same-origin in production, localhost in dev — never "any"', () => {
  env({ ALLOWED_ORIGINS: 'https://club.example, https://www.club.example' });
  assert.deepEqual(loadConfig().allowedOrigins, [
    'https://club.example',
    'https://www.club.example'
  ]);

  env({ NODE_ENV: 'production' });
  assert.equal(loadConfig().allowedOrigins, undefined);

  env({});
  const dev = loadConfig().allowedOrigins;
  assert.ok(dev && dev[0] instanceof RegExp);
  assert.ok(dev[0].test('http://localhost:3000'));
  assert.ok(!dev[0].test('https://evil.example'));
});

test('auth cookies are Secure unless explicitly turned off', () => {
  env({});
  assert.equal(loadConfig().cookieSecure, true);
  env({ COOKIE_SECURE: 'false' });
  assert.equal(loadConfig().cookieSecure, false);
});
