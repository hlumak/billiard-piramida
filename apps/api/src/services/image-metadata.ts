import type { ImageExtension } from './images.ts';

/**
 * Drops metadata from an uploaded picture without re-encoding it: phone photos
 * carry EXIF — the GPS position where they were taken, the device, the time —
 * and the upload store publishes files byte for byte. Only container-level
 * blocks are removed, so pixels (and colour profiles) are untouched; anything
 * that doesn't parse as expected is returned unchanged rather than mangled.
 */
export function stripImageMetadata(ext: ImageExtension, bytes: Uint8Array): Uint8Array {
  try {
    if (ext === 'jpg') return stripJpeg(bytes);
    if (ext === 'png') return stripPng(bytes);
    if (ext === 'webp') return stripWebp(bytes);
  } catch {
    /* malformed container: keep the original */
  }
  return bytes;
}

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length));

/** JPEG: drop APP1 (EXIF, XMP), APP13 (IPTC/Photoshop) and comments before the scan. */
function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return bytes;
    const marker = bytes[offset + 1]!;
    // Start of scan: everything from here on is image data — keep verbatim
    if (marker === 0xda) {
      kept.push(bytes.subarray(offset));
      return concat(kept);
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) return bytes;
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) kept.push(bytes.subarray(offset, end));
    offset = end;
  }
  return bytes;
}

const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/** PNG: drop the text, EXIF and timestamp chunks. */
function stripPng(bytes: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const length = view.getUint32(0);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) return bytes;
    if (!PNG_METADATA_CHUNKS.has(type)) kept.push(bytes.subarray(offset, end));
    offset = end;
    if (type === 'IEND') return concat(kept);
  }
  return bytes;
}

/** WebP: drop the EXIF and XMP chunks and clear their VP8X flags. */
function stripWebp(bytes: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4).getUint32(0, true);
    const end = offset + 8 + size + (size % 2);
    if (end > bytes.length) return bytes;
    if (type === 'VP8X') {
      const chunk = bytes.slice(offset, end);
      chunk[8] = chunk[8]! & ~0x0c; // bit 3 = EXIF present, bit 2 = XMP present
      kept.push(chunk);
    } else if (type !== 'EXIF' && type !== 'XMP ') {
      kept.push(bytes.subarray(offset, end));
    }
    offset = end;
  }
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body.length, true); // RIFF size covers "WEBP" + chunks
  out.set(body, 12);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
