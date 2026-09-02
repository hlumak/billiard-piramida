import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ImageStore, sniffImage } from '../src/services/images.ts';
import {
  extractPreviewImage,
  importPostImage,
  PostImageError,
  type PostImageDeps
} from '../src/services/post-image.ts';

/** Smallest valid PNG (1×1 transparent pixel). */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const PUBLIC_IP = '93.184.216.34';

let dir: string;
let store: ImageStore;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'piramida-post-image-'));
  store = new ImageStore(dir);
  await store.ensureDir();
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

/** In-memory internet: a routing table of URL → response, plus a public-IP resolver. */
function fakeNet(routes: Record<string, Route>, resolve?: PostImageDeps['resolve']) {
  const requested: string[] = [];
  const deps: PostImageDeps = {
    fetch: (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input : input.url
      );
      requested.push(url.href);
      const key = `${url.origin}${url.pathname}`;
      const route = routes[key];
      if (!route) return Promise.resolve(new Response('not found', { status: 404 }));
      return Promise.resolve(route(url, init ?? {}));
    },
    resolve: resolve ?? (async () => [PUBLIC_IP])
  };
  return { deps, requested };
}

const html = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
const png = () =>
  new Response(ONE_PIXEL_PNG, { status: 200, headers: { 'content-type': 'image/png' } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

async function failure(promise: Promise<unknown>): Promise<PostImageError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof PostImageError, `expected PostImageError, got ${String(err)}`);
    return err;
  }
  assert.fail('expected the import to fail');
}

test('sniffImage reads the container from magic bytes only', () => {
  assert.equal(sniffImage(ONE_PIXEL_PNG), 'png');
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpg');
  assert.equal(sniffImage(Buffer.from('GIF89a......')), 'gif');
  assert.equal(sniffImage(Buffer.from('RIFF....WEBPVP8 ')), 'webp');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(sniffImage(Buffer.from('short')), null);
});

test('extractPreviewImage prefers og:image, tolerates attribute order, quotes and entities', () => {
  assert.equal(
    extractPreviewImage(`
      <html><head>
        <meta name="twitter:image" content="https://cdn.example/tw.jpg">
        <meta content='https://cdn.example/og.jpg?a=1&amp;b=2' property='og:image' />
        <meta property="og:image" content="https://cdn.example/second.jpg">
      </head></html>`),
    'https://cdn.example/og.jpg?a=1&b=2'
  );
  assert.equal(extractPreviewImage('<meta property="og:title" content="no picture here">'), null);
  assert.equal(
    extractPreviewImage(
      '<meta property="og:image" content="/a.jpg"><meta property="og:image:secure_url" content="https://s.example/a.jpg">'
    ),
    'https://s.example/a.jpg'
  );
  assert.equal(extractPreviewImage('<meta name="twitter:image" content="/t.jpg">'), '/t.jpg');
});

test('imports the og:image of a post page and stores it content-addressed', async () => {
  const net = fakeNet({
    'https://www.example-social.com/p/abc': () =>
      html('<meta property="og:image" content="/media/pic.png?x=1&amp;y=2">'),
    'https://www.example-social.com/media/pic.png': url => {
      // Entities decoded and relative URL resolved against the page
      assert.equal(url.search, '?x=1&y=2');
      return png();
    }
  });
  const url = await importPostImage('https://www.example-social.com/p/abc', store, net.deps);
  assert.match(url, /^\/api\/uploads\/[0-9a-f]{32}\.png$/);
  assert.ok((await readdir(dir)).includes(url.slice('/api/uploads/'.length)));
  assert.deepEqual(net.requested, [
    'https://www.example-social.com/p/abc',
    'https://www.example-social.com/media/pic.png?x=1&y=2'
  ]);
});

test('a direct link to a picture needs no scraping', async () => {
  const net = fakeNet({ 'https://cdn.example.com/direct.png': () => png() });
  const url = await importPostImage('https://cdn.example.com/direct.png', store, net.deps);
  assert.match(url, /\.png$/);
  assert.equal(net.requested.length, 1);
});

test('follows redirects hop by hop and re-validates each target', async () => {
  const ok = fakeNet({
    'https://short.example/x': () => redirect('https://www.example-social.com/p/abc'),
    'https://www.example-social.com/p/abc': () =>
      html('<meta property="og:image" content="https://cdn.example.com/pic.png">'),
    'https://cdn.example.com/pic.png': () => png()
  });
  await importPostImage('https://short.example/x', store, ok.deps);

  // A redirect that lands on the loopback interface is refused, not followed
  const toLoopback = fakeNet({
    'https://short.example/y': () => redirect('http://127.0.0.1:3001/health')
  });
  const err = await failure(importPostImage('https://short.example/y', store, toLoopback.deps));
  assert.equal(err.code, 'invalid_url');
  assert.deepEqual(toLoopback.requested, ['https://short.example/y']);

  const loop = fakeNet({
    'https://short.example/loop': () => redirect('https://short.example/loop')
  });
  const looped = await failure(importPostImage('https://short.example/loop', store, loop.deps));
  assert.equal(looped.code, 'import_failed');
});

test('private and unresolvable hosts are rejected without a request', async () => {
  const net = fakeNet({}, async hostname => (hostname === 'intranet.local' ? ['10.0.0.5'] : []));
  for (const url of [
    'http://intranet.local/secret.png',
    'https://ghost.example/never-resolves',
    'http://192.168.1.1/',
    'http://[fd00::1]/',
    'http://[::ffff:127.0.0.1]/',
    'javascript:alert(1)',
    'https://user:pw@www.example-social.com/p/abc'
  ]) {
    const err = await failure(importPostImage(url, store, net.deps));
    assert.equal(err.code, 'invalid_url', url);
  }
  assert.deepEqual(net.requested, []);
});

test('reports the specific reason when the page has no picture or the picture is not one', async () => {
  const net = fakeNet({
    'https://www.example-social.com/p/text-only': () => html('<title>just words</title>'),
    'https://www.example-social.com/p/svg': () =>
      html('<meta property="og:image" content="https://cdn.example.com/logo.svg">'),
    'https://cdn.example.com/logo.svg': () =>
      new Response('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }),
    'https://www.example-social.com/p/gone': () => new Response('login', { status: 403 }),
    'https://www.example-social.com/p/huge': () =>
      new Response(ONE_PIXEL_PNG, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(50 * 1024 * 1024) }
      })
  });
  const noImage = await failure(
    importPostImage('https://www.example-social.com/p/text-only', store, net.deps)
  );
  assert.equal(noImage.code, 'no_image_found');

  const svg = await failure(
    importPostImage('https://www.example-social.com/p/svg', store, net.deps)
  );
  assert.equal(svg.code, 'unsupported_image');

  const wall = await failure(
    importPostImage('https://www.example-social.com/p/gone', store, net.deps)
  );
  assert.equal(wall.code, 'import_failed');

  const huge = await failure(
    importPostImage('https://www.example-social.com/p/huge', store, net.deps)
  );
  assert.equal(huge.code, 'import_failed');
});

test('with a Meta token, Instagram posts go through oEmbed and skip the page', async () => {
  const net = fakeNet({
    'https://graph.facebook.com/v21.0/instagram_oembed': url => {
      assert.equal(url.searchParams.get('url'), 'https://www.instagram.com/p/abc/');
      assert.equal(url.searchParams.get('access_token'), 'app|secret');
      return new Response(JSON.stringify({ thumbnail_url: 'https://cdn.example.com/thumb.png' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    },
    'https://cdn.example.com/thumb.png': () => png()
  });
  const url = await importPostImage('https://www.instagram.com/p/abc/', store, {
    ...net.deps,
    oembedToken: 'app|secret'
  });
  assert.match(url, /\.png$/);
  assert.ok(!net.requested.includes('https://www.instagram.com/p/abc/'));

  // oEmbed trouble falls back to the page scrape rather than failing outright
  const fallback = fakeNet({
    'https://graph.facebook.com/v21.0/instagram_oembed': () =>
      new Response('{"error":{}}', { status: 400 }),
    'https://www.instagram.com/p/abc/': () =>
      html('<meta property="og:image" content="https://cdn.example.com/thumb.png">'),
    'https://cdn.example.com/thumb.png': () => png()
  });
  await importPostImage('https://www.instagram.com/p/abc/', store, {
    ...fallback.deps,
    oembedToken: 'app|secret'
  });
  assert.ok(fallback.requested.includes('https://www.instagram.com/p/abc/'));
});
