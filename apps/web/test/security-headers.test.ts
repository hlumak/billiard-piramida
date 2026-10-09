import { describe, expect, test } from 'vitest';
import {
  contentSecurityPolicy,
  createNonce,
  withSecurityHeaders
} from '../src/lib/security-headers';

describe('security headers', () => {
  test('pages get a nonce-based CSP that forbids framing', async () => {
    const csp = contentSecurityPolicy('abc123', 'https://club.example/news', '');
    expect(csp).toContain(`script-src 'self' 'nonce-abc123'`);
    expect(csp).toContain(`frame-ancestors 'none'`);
    expect(csp).toContain('wss://club.example');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);

    const page = withSecurityHeaders(
      new Response('<html></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      new Request('https://club.example/news'),
      csp
    );
    expect(page.headers.get('content-security-policy')).toBe(csp);
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
    expect(page.headers.get('strict-transport-security')).toContain('max-age=');
    expect(await page.text()).toBe('<html></html>');
  });

  test('non-HTML responses get the base headers but no CSP; HSTS only over https', () => {
    const json = withSecurityHeaders(
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
      new Request('http://localhost:3000/robots.txt'),
      'default-src none'
    );
    expect(json.headers.get('content-security-policy')).toBeNull();
    expect(json.headers.get('x-content-type-options')).toBe('nosniff');
    expect(json.headers.get('strict-transport-security')).toBeNull();
  });

  test('nonces are fresh per call', () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
