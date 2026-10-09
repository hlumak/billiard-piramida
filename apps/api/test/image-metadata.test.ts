import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripImageMetadata } from '../src/services/image-metadata.ts';

const text = (value: string) => Buffer.from(value, 'latin1');
const SECRET = 'GPS 52.2297N 21.0122E';

/** A JPEG segment: FF marker, big-endian length (incl. itself), payload. */
function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

test('JPEG: EXIF/XMP/comments go, JFIF, ICC profile and scan data stay', () => {
  const jfif = segment(0xe0, text('JFIF\0\x01\x01'));
  const icc = segment(0xe2, text('ICC_PROFILE\0profile'));
  const scan = Buffer.concat([
    segment(0xda, text('scan-header')),
    text('pixels'),
    Buffer.from([0xff, 0xd9])
  ]);
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jfif,
    segment(0xe1, text(`Exif\0\0${SECRET}`)),
    segment(0xe1, text(`http://ns.adobe.com/xap/1.0/\0${SECRET}`)),
    icc,
    segment(0xfe, text(`comment ${SECRET}`)),
    scan
  ]);
  const out = Buffer.from(stripImageMetadata('jpg', jpeg));
  assert.ok(!out.includes(SECRET), 'metadata must be gone');
  assert.deepEqual(out, Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, icc, scan]));
});

test('PNG: text, EXIF and time chunks go, image chunks stay', () => {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, text(type), data, Buffer.alloc(4)]);
  };
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = chunk('IHDR', Buffer.alloc(13));
  const idat = chunk('IDAT', text('pixels'));
  const iend = chunk('IEND', Buffer.alloc(0));
  const png = Buffer.concat([
    signature,
    ihdr,
    chunk('tEXt', text(`Location\0${SECRET}`)),
    chunk('eXIf', text(SECRET)),
    idat,
    iend
  ]);
  const out = Buffer.from(stripImageMetadata('png', png));
  assert.deepEqual(out, Buffer.concat([signature, ihdr, idat, iend]));
});

test('WebP: EXIF/XMP chunks go, their flags are cleared, RIFF size is fixed', () => {
  const chunk = (type: string, data: Buffer) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    return Buffer.concat([
      text(type),
      size,
      data,
      data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)
    ]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x0c | 0x10; // EXIF + XMP + alpha flags
  const body = Buffer.concat([
    chunk('VP8X', vp8x),
    chunk('VP8L', text('pixels')),
    chunk('EXIF', text(SECRET)),
    chunk('XMP ', text(SECRET))
  ]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(4 + body.length);
  const webp = Buffer.concat([text('RIFF'), riffSize, text('WEBP'), body]);

  const out = Buffer.from(stripImageMetadata('webp', webp));
  assert.ok(!out.includes(SECRET));
  assert.equal(out.readUInt32LE(4), out.length - 8, 'RIFF size covers the rest of the file');
  assert.equal(out[20], 0x10, 'only the alpha flag is left');
  assert.ok(out.includes(text('VP8L')));
});

test('a malformed container is returned unchanged, not mangled', () => {
  const broken = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]);
  assert.deepEqual(Buffer.from(stripImageMetadata('jpg', broken)), broken);
});
