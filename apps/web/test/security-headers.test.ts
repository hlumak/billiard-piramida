import { describe, expect, test } from 'vitest';
import {
  contentSecurityPolicy,
  createNonce,
  withSecurityHeaders
} from '../src/lib/security-headers';

describe('security headers', () => {
  test('pages get a nonce-based CSP that forbids framing', async () => {
    const csp = contentSecurityPolicy('abc123', 'https://club.example/news', '');
    expect(csp).toContain(`script-src 'self' 'nonce-abc123' https://challenges.cloudflare.com;`);
    expect(csp).toContain(`frame-src https://www.google.com https://challenges.cloudflare.com;`);
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

  test('a page is revalidated on every visit and never kept by a shared cache', () => {
    // Its CSP nonce is per request, and "/" answers by the language cookie
    const page = withSecurityHeaders(
      new Response('<html></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      new Request('https://club.example/'),
      null
    );
    expect(page.headers.get('cache-control')).toBe('private, no-cache');
  });

  test('a response that set its own caching keeps it', () => {
    const sitemap = withSecurityHeaders(
      new Response('<urlset/>', {
        headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' }
      }),
      new Request('https://club.example/sitemap.xml'),
      null
    );
    expect(sitemap.headers.get('cache-control')).toBe('public, max-age=3600');
    const redirect = withSecurityHeaders(
      new Response(null, { status: 308, headers: { location: '/prices' } }),
      new Request('https://club.example/prices/'),
      null
    );
    expect(redirect.headers.get('cache-control')).toBeNull();
  });

  test('other origins get no handle on a page and cannot embed its responses', () => {
    const page = withSecurityHeaders(
      new Response('<html></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      new Request('https://club.example/'),
      null
    );
    expect(page.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(page.headers.get('cross-origin-resource-policy')).toBe('same-site');
  });

  test('nonces are fresh per call', () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
