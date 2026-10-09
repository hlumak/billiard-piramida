import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/lib/passwords.ts';

test('hashes record their cost and verify', async () => {
  const stored = await hashPassword('correct horse');
  assert.match(stored, /^scrypt\$32768\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.deepEqual(await verifyPassword('correct horse', stored), {
    valid: true,
    needsRehash: false
  });
  assert.deepEqual(await verifyPassword('wrong horse', stored), {
    valid: false,
    needsRehash: false
  });
});

test('legacy salt:hex hashes still verify and ask to be re-hashed', async () => {
  const salt = 'a'.repeat(32);
  const legacy = `${salt}:${scryptSync('old pass', salt, 64).toString('hex')}`;
  assert.deepEqual(await verifyPassword('old pass', legacy), { valid: true, needsRehash: true });
  assert.deepEqual(await verifyPassword('nope', legacy), { valid: false, needsRehash: false });
});

test('malformed stored values never verify', async () => {
  for (const stored of ['', 'garbage', 'scrypt$x$8$1$salt$key', 'scrypt$32768$8$3$$']) {
    assert.equal((await verifyPassword('anything', stored)).valid, false);
  }
});
