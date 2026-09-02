import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Staff-uploaded pictures (news cards, later tournaments) live on local disk
 * and are served by the API itself under this prefix — nginx already proxies
 * `/api/` to us, so a stored `/api/uploads/<hash>.webp` works as an
 * app-relative path everywhere `isSafeUrl` is enforced.
 */
export const UPLOADS_URL_PREFIX = '/api/uploads/';

/** Hard ceiling per picture; the news card is 96px tall, a phone photo is plenty. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageExtension = 'jpg' | 'png' | 'webp' | 'gif';

/**
 * Sniffs the container from the first bytes. The browser-supplied mimetype and
 * the filename are both under the sender's control, so neither decides what we
 * store or how it is served: an HTML file renamed `.png` would be served as
 * `text/html` from our origin otherwise.
 */
export function sniffImage(bytes: Uint8Array): ImageExtension | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

export class UnsupportedImageError extends Error {
  constructor() {
    super('unsupported image format');
    this.name = 'UnsupportedImageError';
  }
}

/**
 * Content-addressed file store. The name is the SHA-256 of the bytes, so the
 * same picture uploaded twice is one file, a changed picture is a new URL, and
 * the static route can mark everything immutable with a year-long max-age.
 * Nothing is ever deleted here: a hash may back several cards and a card that
 * was hidden may come back — a few megabytes of orphans cost less than a
 * broken carousel image.
 */
export class ImageStore {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /** Writes the picture (validating the format) and returns its app-relative URL. */
  async save(bytes: Uint8Array): Promise<string> {
    const ext = sniffImage(bytes);
    if (ext === null) throw new UnsupportedImageError();
    const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`;
    try {
      // 'wx' fails if the file exists — same hash, same bytes, nothing to redo
      await writeFile(join(this.dir, name), bytes, { flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    return `${UPLOADS_URL_PREFIX}${name}`;
  }
}
