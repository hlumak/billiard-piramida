import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSafeUrl } from '../src/urls.ts';

test('isSafeUrl accepts app paths and http(s) URLs', () => {
  for (const url of ['/prices', '/api/uploads/abc.webp', 'https://club.example/x', 'http://a.b']) {
    assert.equal(isSafeUrl(url), true, url);
  }
});

test('isSafeUrl refuses script, data and protocol-relative URLs, however disguised', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,x',
    '//evil.example',
    '/\\evil.example',
    // browsers strip tab/CR/LF, turning these into //evil.example
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    ' https://padded.example',
    ''
  ]) {
    assert.equal(isSafeUrl(url), false, JSON.stringify(url));
  }
});
