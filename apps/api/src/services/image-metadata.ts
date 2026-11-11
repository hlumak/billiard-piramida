import type { ImageExtension } from './images.ts';

/**
 * Drops metadata from an uploaded picture without re-encoding it: phone photos
 * carry EXIF — the GPS position where they were taken, the device, the time —
 * and the upload store publishes files byte for byte. Only container-level
 * blocks are removed, so pixels (and colour profiles) are untouched; anything
 * that doesn't parse as expected is returned unchanged rather than mangled.
 * The one thing kept from EXIF is which way up the picture is.
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

const EXIF_PREFIX = 'Exif\0\0';
const ORIENTATION_TAG = 0x0112;

/**
 * The Orientation tag (1–8) of an EXIF block, which is a TIFF file: byte
 * order, the offset of the first directory, then 12-byte entries. Null when
 * there is none or the block does not read as TIFF.
 */
function readOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 14) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (view.getUint16(2, little) !== 42) return null;
  const directory = view.getUint32(4, little);
  if (directory + 2 > tiff.length) return null;
  const count = view.getUint16(directory, little);
  for (let i = 0; i < count; i++) {
    const entry = directory + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    if (view.getUint16(entry, little) !== ORIENTATION_TAG) continue;
    const value = view.getUint16(entry + 8, little);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** A TIFF block holding the Orientation tag and nothing else. */
function orientationTiff(orientation: number): Uint8Array {
  // "MM" (big-endian), 42, first directory at 8; one entry: tag 0x0112,
  // type SHORT, count 1, the value; no further directory
  return Uint8Array.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00
  ]);
}

/**
 * How the picture is turned is the one thing in EXIF the page needs: phones
 * store the sensor's pixels and say "rotate 90°" in the tag, so a photo
 * stripped of it was published lying on its side. Anything but "upright" (1)
 * is carried over in a block of its own.
 */
const keepsOrientation = (orientation: number | null): orientation is number =>
  orientation !== null && orientation !== 1;

/**
 * JPEG: drop APP1 (EXIF, XMP), APP13 (IPTC/Photoshop), comments and the
 * multi-picture index, and everything after the end of the image.
 */
function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  // Where an orientation block goes: after the start marker and the JFIF header
  let exifSlot = 1;
  let orientation: number | null = null;
  let sawScan = false;

  const finish = () => {
    if (keepsOrientation(orientation)) {
      const tiff = orientationTiff(orientation);
      const head = Uint8Array.from([0xff, 0xe1, 0, EXIF_PREFIX.length + tiff.length + 2]);
      const prefix = Uint8Array.from(EXIF_PREFIX, char => char.charCodeAt(0));
      kept.splice(exifSlot, 0, concat([head, prefix, tiff]));
    }
    return concat(kept);
  };

  let offset = 2;
  while (offset + 2 <= bytes.length) {
    if (bytes[offset] !== 0xff) return bytes;
    const marker = bytes[offset + 1]!;
    // Any number of 0xFF fill bytes may sit in front of a marker
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // End of image. A phone's "motion photo" appends a video clip here, and a
    // multi-picture file further pictures with EXIF of their own: none of it
    // is part of this picture, and all of it used to be published with it
    if (marker === 0xd9) {
      kept.push(bytes.subarray(offset, offset + 2));
      return finish();
    }
    // Markers that stand alone, with no length after them
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) return bytes;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) return bytes;

    if (marker === 0xda) {
      // Start of scan: its header, then image data up to the next marker. In
      // that data 0xFF is always followed by 0x00 or a restart marker.
      let scanEnd = end;
      while (scanEnd < bytes.length) {
        if (bytes[scanEnd] !== 0xff) {
          scanEnd += 1;
          continue;
        }
        const next = bytes[scanEnd + 1];
        if (next === 0x00 || (next !== undefined && next >= 0xd0 && next <= 0xd7)) {
          scanEnd += 2;
        } else if (next === undefined) {
          scanEnd = bytes.length;
        } else {
          break;
        }
      }
      kept.push(bytes.subarray(offset, scanEnd));
      sawScan = true;
      offset = scanEnd;
      continue;
    }

    const payload = bytes.subarray(offset + 4, end);
    if (marker === 0xe1 && ascii(payload, 0, EXIF_PREFIX.length) === EXIF_PREFIX) {
      orientation ??= readOrientation(payload.subarray(EXIF_PREFIX.length));
    }
    const drop =
      marker === 0xe1 ||
      marker === 0xed ||
      marker === 0xfe ||
      // The index of the further pictures dropped above
      (marker === 0xe2 && ascii(payload, 0, 4) === 'MPF\0');
    if (!drop) {
      if (marker === 0xe0 && kept.length === exifSlot) exifSlot += 1;
      kept.push(bytes.subarray(offset, end));
    }
    offset = end;
  }
  // No end marker: a picture cut short still has its scan; anything else is
  // not a JPEG this understands
  return sawScan ? finish() : bytes;
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

/**
 * WebP: drop the EXIF and XMP chunks and clear their VP8X flags — except that
 * a picture stored turned keeps an EXIF chunk saying only how (see
 * keepsOrientation), and with it the EXIF flag.
 */
function stripWebp(bytes: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [];
  let header: Uint8Array | null = null;
  let keptExif = false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4).getUint32(0, true);
    const end = offset + 8 + size + (size % 2);
    if (end > bytes.length) return bytes;
    if (type === 'VP8X') {
      header = bytes.slice(offset, end);
      header[8] = header[8]! & ~0x0c; // bit 3 = EXIF present, bit 2 = XMP present
      kept.push(header);
    } else if (type === 'EXIF') {
      // Raw TIFF, though some writers put the JPEG "Exif\0\0" prefix first
      const payload = bytes.subarray(offset + 8, offset + 8 + size);
      const prefixed = ascii(payload, 0, EXIF_PREFIX.length) === EXIF_PREFIX;
      const orientation = readOrientation(
        prefixed ? payload.subarray(EXIF_PREFIX.length) : payload
      );
      if (!keptExif && header !== null && keepsOrientation(orientation)) {
        const tiff = orientationTiff(orientation);
        const head = new Uint8Array(8);
        head.set(Uint8Array.from('EXIF', char => char.charCodeAt(0)));
        new DataView(head.buffer).setUint32(4, tiff.length, true);
        kept.push(concat([head, tiff]));
        header[8] = header[8]! | 0x08;
        keptExif = true;
      }
    } else if (type !== 'XMP ') {
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
