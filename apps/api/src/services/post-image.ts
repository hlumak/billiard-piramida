import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { ImageStore, MAX_IMAGE_BYTES, UnsupportedImageError } from './images.ts';

/**
 * "Pull the picture from this Instagram / Facebook post." There is no official,
 * token-free API for either, so this is a link-preview fetch: load the post
 * page, read its `og:image` — the very tag the platforms publish so that
 * messengers can render a preview — download that picture and store it like an
 * upload. Optional Meta oEmbed token improves Instagram reliability.
 *
 * Both platforms rate-limit and A/B-test anonymous page loads (sometimes a
 * login wall comes back instead of the post), so callers must treat failure as
 * ordinary and offer the manual upload as the fallback — it always works.
 *
 * The URL is admin-supplied but still arbitrary, and the request leaves the
 * server: every hop is restricted to http(s) on a public address (no loopback,
 * RFC 1918, link-local, metadata endpoints), redirects are followed by hand so
 * each target is re-checked, and bodies are capped before being buffered.
 */

export type PostImageFailure =
  | 'invalid_url'
  | 'no_image_found'
  | 'unsupported_image'
  | 'import_failed';

export class PostImageError extends Error {
  readonly code: PostImageFailure;

  constructor(code: PostImageFailure, detail?: string) {
    super(detail ?? code);
    this.name = 'PostImageError';
    this.code = code;
  }
}

/** Seams for tests: a fake network and a fake resolver, no sockets involved. */
export interface PostImageDeps {
  fetch?: typeof globalThis.fetch;
  /** Every address the hostname resolves to; all of them must be public. */
  resolve?: (hostname: string) => Promise<string[]>;
  /** Meta Graph API app token for `instagram_oembed`; unset = scrape og:image only. */
  oembedToken?: string | undefined;
}

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
/** A post page is a few hundred KB; anything larger is not what we came for. */
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; piramida-news-importer/1.0)';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Everything a server-side fetch must never reach, v6 mapped-v4 included. */
const PRIVATE_RANGES = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  PRIVATE_RANGES.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
] as const) {
  PRIVATE_RANGES.addSubnet(net, prefix, 'ipv6');
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !PRIVATE_RANGES.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true });
  return records.map(r => r.address);
}

/** http(s), no embedded credentials, and a host that resolves only to public addresses. */
async function assertFetchable(url: URL, resolve: NonNullable<PostImageDeps['resolve']>) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new PostImageError('invalid_url');
  if (url.username !== '' || url.password !== '') throw new PostImageError('invalid_url');
  // URL keeps IPv6 literals in brackets
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) !== 0 ? [host] : await resolve(host).catch(() => []);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new PostImageError('invalid_url', `${host} is not a public host`);
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PostImageError('import_failed', 'response too large');
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PostImageError('import_failed', 'response too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

interface Fetched {
  url: URL;
  contentType: string;
  bytes: Uint8Array;
}

/** GET with manual, re-validated redirects, a timeout and a body cap. */
async function safeFetch(
  start: URL,
  { accept, maxBytes }: { accept: string; maxBytes: number },
  deps: Required<Pick<PostImageDeps, 'fetch' | 'resolve'>>
): Promise<Fetched> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertFetchable(url, deps.resolve);
    let response: Response;
    try {
      response = await deps.fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept, 'user-agent': USER_AGENT }
      });
    } catch (err) {
      throw new PostImageError('import_failed', `fetch failed: ${(err as Error).message}`);
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new PostImageError('import_failed', 'redirect without location');
      try {
        url = new URL(location, url);
      } catch {
        throw new PostImageError('import_failed', 'bad redirect target');
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new PostImageError('import_failed', `upstream responded ${response.status}`);
    }
    return {
      url,
      contentType: (response.headers.get('content-type') ?? '').toLowerCase(),
      bytes: await readCapped(response, maxBytes)
    };
  }
  throw new PostImageError('import_failed', 'too many redirects');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'"
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? whole;
  });
}

function attributesOf(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    const name = match[1]?.toLowerCase();
    if (name) attrs[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

/** Preferred first; the first tag of the best kind wins (og:image lists lead with the main picture). */
const IMAGE_META_KEYS = [
  'og:image:secure_url',
  'og:image',
  'og:image:url',
  'twitter:image',
  'twitter:image:src'
];

/** The picture a link preview of this page would show, or null. Exported for tests. */
export function extractPreviewImage(html: string): string | null {
  let best: { rank: number; url: string } | null = null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = attributesOf(tag);
    const key = (attrs.property ?? attrs.name)?.toLowerCase();
    const content = attrs.content?.trim();
    if (!key || !content) continue;
    const rank = IMAGE_META_KEYS.indexOf(key);
    if (rank === -1 || (best !== null && rank >= best.rank)) continue;
    best = { rank, url: decodeEntities(content) };
  }
  return best?.url ?? null;
}

function isInstagram(url: URL): boolean {
  return url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com');
}

/**
 * Meta's oEmbed endpoint returns the post thumbnail for an app token holder
 * regardless of the page's anonymous-visitor mood. Any failure just falls back
 * to the page scrape below — the token is a nicety, not a requirement.
 */
async function instagramThumbnail(
  post: URL,
  token: string,
  deps: Required<Pick<PostImageDeps, 'fetch' | 'resolve'>>
): Promise<URL | null> {
  const endpoint = new URL('https://graph.facebook.com/v21.0/instagram_oembed');
  endpoint.searchParams.set('url', post.href);
  endpoint.searchParams.set('fields', 'thumbnail_url');
  endpoint.searchParams.set('access_token', token);
  try {
    const { bytes } = await safeFetch(
      endpoint,
      { accept: 'application/json', maxBytes: 64 * 1024 },
      deps
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const thumbnail =
      typeof parsed === 'object' && parsed !== null && 'thumbnail_url' in parsed
        ? parsed.thumbnail_url
        : null;
    return typeof thumbnail === 'string' ? new URL(thumbnail) : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a post (or any page, or a direct image link) to a stored picture and
 * returns the picture's app-relative URL. Throws `PostImageError`.
 */
export async function importPostImage(
  rawUrl: string,
  store: ImageStore,
  options: PostImageDeps = {}
): Promise<string> {
  const deps = {
    fetch: options.fetch ?? globalThis.fetch,
    resolve: options.resolve ?? defaultResolve
  };
  let postUrl: URL;
  try {
    postUrl = new URL(rawUrl.trim());
  } catch {
    throw new PostImageError('invalid_url');
  }

  let imageUrl: URL | null = null;
  if (options.oembedToken && isInstagram(postUrl)) {
    imageUrl = await instagramThumbnail(postUrl, options.oembedToken, deps);
  }

  let imageBytes: Uint8Array | null = null;
  if (imageUrl === null) {
    const page = await safeFetch(
      postUrl,
      { accept: 'text/html,image/*;q=0.9,*/*;q=0.5', maxBytes: MAX_IMAGE_BYTES },
      deps
    );
    if (page.contentType.startsWith('image/')) {
      // A direct link to the picture itself — nothing to scrape
      imageBytes = page.bytes;
    } else {
      if (page.bytes.byteLength > MAX_HTML_BYTES) {
        throw new PostImageError('import_failed', 'page too large');
      }
      const found = extractPreviewImage(new TextDecoder().decode(page.bytes));
      if (found === null) throw new PostImageError('no_image_found');
      try {
        imageUrl = new URL(found, page.url);
      } catch {
        throw new PostImageError('no_image_found');
      }
    }
  }

  if (imageBytes === null && imageUrl !== null) {
    const picture = await safeFetch(
      imageUrl,
      { accept: 'image/*', maxBytes: MAX_IMAGE_BYTES },
      deps
    );
    imageBytes = picture.bytes;
  }
  if (imageBytes === null) throw new PostImageError('no_image_found');

  try {
    return await store.save(imageBytes);
  } catch (err) {
    if (err instanceof UnsupportedImageError) throw new PostImageError('unsupported_image');
    throw err;
  }
}
