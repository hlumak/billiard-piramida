import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isTestingSecret,
  SpentTokens,
  verifyTurnstile,
  type TurnstileOptions
} from '../src/lib/turnstile.ts';

/** A stand-in for Siteverify that answers `body` and records what it was sent. */
function siteverify(body: unknown) {
  const sent: URLSearchParams[] = [];
  const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(init?.body as URLSearchParams);
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
  return { fake, sent };
}

function options(fake: typeof fetch, overrides: Partial<TurnstileOptions> = {}): TurnstileOptions {
  return {
    secret: 'real-secret',
    hostnames: ['billiard-piramida.pl'],
    acceptTestingKeys: false,
    fetch: fake,
    ...overrides
  };
}

const SOLVED = { success: true, action: 'booking', hostname: 'billiard-piramida.pl' };

test('a token solved for this action on our host passes, and the secret stays server-side', async () => {
  const { fake, sent } = siteverify(SOLVED);
  const verdict = await verifyTurnstile(options(fake), 'tok', 'booking', '198.51.100.7');
  assert.deepEqual(verdict, { ok: true });
  assert.equal(sent[0]?.get('secret'), 'real-secret');
  assert.equal(sent[0]?.get('response'), 'tok');
  assert.equal(sent[0]?.get('remoteip'), '198.51.100.7');
});

test('no token, a failed solve, another action or another host is refused', async () => {
  const { fake, sent } = siteverify(SOLVED);
  assert.equal((await verifyTurnstile(options(fake), undefined, 'booking', 'ip')).ok, false);
  assert.equal((await verifyTurnstile(options(fake), 'x'.repeat(3000), 'booking', 'ip')).ok, false);
  // Neither of those is worth a call to Cloudflare
  assert.equal(sent.length, 0);

  const failed = siteverify({ success: false, 'error-codes': ['timeout-or-duplicate'] });
  assert.deepEqual(await verifyTurnstile(options(failed.fake), 'tok', 'booking', 'ip'), {
    ok: false,
    reason: 'timeout-or-duplicate'
  });
  assert.deepEqual(await verifyTurnstile(options(fake), 'tok', 'register', 'ip'), {
    ok: false,
    reason: 'action_mismatch'
  });
  const elsewhere = siteverify({ ...SOLVED, hostname: 'copycat.example' });
  assert.deepEqual(await verifyTurnstile(options(elsewhere.fake), 'tok', 'booking', 'ip'), {
    ok: false,
    reason: 'hostname_mismatch'
  });
});

test('an unreachable Siteverify fails closed', async () => {
  const down = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  assert.deepEqual(await verifyTurnstile(options(down), 'tok', 'booking', 'ip'), {
    ok: false,
    reason: 'siteverify_unreachable'
  });
});

test('answers from Cloudflare test keys count only where allowed', async () => {
  const { fake } = siteverify({
    success: true,
    hostname: 'example.com',
    metadata: { result_with_testing_key: true }
  });
  assert.equal((await verifyTurnstile(options(fake), 'tok', 'booking', 'ip')).ok, false);
  const dev = options(fake, { acceptTestingKeys: true });
  assert.equal((await verifyTurnstile(dev, 'tok', 'booking', 'ip')).ok, true);

  assert.ok(isTestingSecret('1x0000000000000000000000000000000AA'));
  assert.ok(isTestingSecret('2x0000000000000000000000000000000AA'));
  assert.ok(!isTestingSecret('0x4AAAAAAA-real-looking-secret'));
});

test('a token counts once, and is forgotten only after it could no longer pass', () => {
  const spent = new SpentTokens();
  const now = 1_000_000;
  assert.equal(spent.claim('tok', now), true);
  assert.equal(spent.claim('tok', now + 1), false);
  assert.equal(spent.claim('other', now + 1), true);
  assert.equal(spent.claim('tok', now + 4 * 60_000), false);
  // Past its five minutes Siteverify would refuse it anyway
  assert.equal(spent.claim('tok', now + 5 * 60_000 + 1), true);
});
