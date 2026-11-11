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

/** An EXIF block (TIFF) with a camera make, the orientation and a GPS-like text. */
function exifTiff(orientation: number, littleEndian: boolean): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  const u16 = (value: number, at: number) =>
    littleEndian ? tiff.writeUInt16LE(value, at) : tiff.writeUInt16BE(value, at);
  const u32 = (value: number, at: number) =>
    littleEndian ? tiff.writeUInt32LE(value, at) : tiff.writeUInt32BE(value, at);
  tiff.write(littleEndian ? 'II' : 'MM', 0, 'latin1');
  u16(42, 2);
  u32(8, 4);
  u16(2, 8);
  // Make (ASCII, 4 bytes inline), then Orientation (SHORT)
  u16(0x010f, 10);
  u16(2, 12);
  u32(4, 14);
  tiff.write('Cam\0', 18, 'latin1');
  u16(0x0112, 22);
  u16(3, 24);
  u32(1, 26);
  u16(orientation, 30);
  return Buffer.concat([tiff, text(SECRET)]);
}

test('JPEG: a photo stored turned keeps which way up it is, and nothing else', () => {
  const jfif = segment(0xe0, text('JFIF\0\x01\x01'));
  const scan = Buffer.concat([
    segment(0xda, text('hdr')),
    text('pixels'),
    Buffer.from([0xff, 0xd9])
  ]);
  for (const littleEndian of [true, false]) {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      jfif,
      segment(0xe1, Buffer.concat([text('Exif\0\0'), exifTiff(6, littleEndian)])),
      scan
    ]);
    const out = Buffer.from(stripImageMetadata('jpg', jpeg));
    assert.ok(!out.includes(SECRET), 'the position must be gone');
    assert.ok(!out.includes('Cam'), 'and the camera');
    // Start marker, JFIF, then an EXIF block of the orientation alone
    const exif = out.subarray(2 + jfif.length);
    assert.deepEqual(exif.subarray(0, 4), Buffer.from([0xff, 0xe1, 0, 34]));
    assert.equal(exif.subarray(4, 10).toString('latin1'), 'Exif\0\0');
    const tiff = exif.subarray(10, 36);
    assert.equal(tiff.readUInt16BE(8), 1, 'one tag');
    assert.equal(tiff.readUInt16BE(10), 0x0112);
    assert.equal(tiff.readUInt16BE(18), 6, 'rotate 90° clockwise, as the phone said');
    assert.deepEqual(exif.subarray(36), scan);
  }

  // Upright already: no block at all
  const upright = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe1, Buffer.concat([text('Exif\0\0'), exifTiff(1, true)])),
    scan
  ]);
  assert.deepEqual(
    Buffer.from(stripImageMetadata('jpg', upright)),
    Buffer.concat([Buffer.from([0xff, 0xd8]), scan])
  );
});

test('JPEG: what follows the end of the image is dropped, restart markers and fill bytes are not', () => {
  const dqt = segment(0xdb, text('tables'));
  // Scan data holds a stuffed 0xFF and a restart marker; a second scan follows
  const scans = Buffer.concat([
    segment(0xda, text('one')),
    Buffer.from([1, 0xff, 0x00, 2, 0xff, 0xd0, 3]),
    segment(0xc4, text('huffman')),
    segment(0xda, text('two')),
    Buffer.from([4, 5]),
    Buffer.from([0xff, 0xd9])
  ]);
  const clip = text(`ftypmp4 motion photo ${SECRET}`);
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    // Fill bytes in front of a marker are legal
    Buffer.from([0xff, 0xff]),
    dqt,
    segment(0xe2, text(`MPF\0index ${SECRET}`)),
    scans,
    clip
  ]);
  const out = Buffer.from(stripImageMetadata('jpg', jpeg));
  assert.ok(!out.includes(SECRET));
  assert.deepEqual(out, Buffer.concat([Buffer.from([0xff, 0xd8]), dqt, scans]));
});

test('WebP: a picture stored turned keeps an EXIF chunk of the orientation alone', () => {
  const chunk = (type: string, data: Buffer) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    return Buffer.concat([text(type), size, data, Buffer.alloc(data.length % 2)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x0c;
  const body = Buffer.concat([
    chunk('VP8X', vp8x),
    chunk('VP8 ', text('pixels')),
    chunk('EXIF', exifTiff(8, true)),
    chunk('XMP ', text(SECRET))
  ]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(4 + body.length);
  const out = Buffer.from(
    stripImageMetadata('webp', Buffer.concat([text('RIFF'), riffSize, text('WEBP'), body]))
  );
  assert.ok(!out.includes(SECRET));
  assert.equal(out.readUInt32LE(4), out.length - 8);
  assert.equal(out[20], 0x08, 'the EXIF flag stays, the XMP one goes');
  const exif = out.subarray(out.indexOf(text('EXIF')));
  assert.equal(exif.readUInt32LE(4), 26);
  assert.equal(exif.readUInt16BE(8 + 18), 8);
});

test('a malformed container is returned unchanged, not mangled', () => {
  const broken = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]);
  assert.deepEqual(Buffer.from(stripImageMetadata('jpg', broken)), broken);
});
