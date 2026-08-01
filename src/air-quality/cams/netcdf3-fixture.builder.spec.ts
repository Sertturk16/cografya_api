import { describe, expect, it } from '@jest/globals';
import { inflateRawSync } from 'node:zlib';
import { buildNetcdf3, buildZipArchive } from './netcdf3-fixture.builder';

/**
 * Byte-level pins for the fixture builder itself, asserted against the FORMAT SPECIFICATIONS
 * (NetCDF classic BNF / APPNOTE.TXT), independent of our reader — so builder and reader
 * cannot silently agree on a shared wrong model at the byte level.
 */
describe('buildNetcdf3', () => {
  it('emits CDF\\x01 magic, big-endian numrecs, and the dimension list verbatim', () => {
    const bytes = buildNetcdf3({
      recordCount: 3,
      dimensions: [
        { name: 'x', length: 2 },
        { name: 'time', length: 'record' },
      ],
      variables: [{ name: 'x', dimensions: ['x'], data: [1.5, 2.5] }],
    });
    // magic
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x43, 0x44, 0x46, 0x01]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // numrecs, big-endian
    expect(view.getInt32(4, false)).toBe(3);
    // NC_DIMENSION tag + count
    expect(view.getInt32(8, false)).toBe(0x0a);
    expect(view.getInt32(12, false)).toBe(2);
    // first dimension: name length 1, 'x' padded to 4, length 2
    expect(view.getInt32(16, false)).toBe(1);
    expect(bytes[20]).toBe('x'.charCodeAt(0));
    expect(view.getInt32(24, false)).toBe(2);
    // record dimension written as 0 in the header
    expect(view.getInt32(28, false)).toBe(4); // name length "time"
    expect(view.getInt32(36, false)).toBe(0); // record marker
  });

  it('writes float32 data big-endian at the var begin offset', () => {
    const bytes = buildNetcdf3({
      recordCount: 0,
      dimensions: [{ name: 'x', length: 1 }],
      variables: [{ name: 'x', dimensions: ['x'], data: [1.0] }],
    });
    // 1.0f big-endian = 3F 80 00 00 — must appear exactly once, at the data start.
    const hex = Buffer.from(bytes).toString('hex');
    expect(hex).toContain('3f800000');
    // The value sits at the END of the file (single fixed var, data after header).
    expect(Buffer.from(bytes.subarray(bytes.byteLength - 4)).toString('hex')).toBe('3f800000');
  });
});

describe('buildZipArchive', () => {
  it('emits the PK\\x03\\x04 local magic, a central directory and a 22-byte EOCD', () => {
    const body = new TextEncoder().encode('hello');
    const archive = buildZipArchive([{ name: 'a.nc', bytes: body }]);
    expect(Array.from(archive.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const eocd = archive.byteLength - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(1); // entry count
    // STORED: the body appears verbatim in the archive.
    expect(Buffer.from(archive).includes(Buffer.from(body))).toBe(true);
  });

  it('DEFLATE mode really deflates (bytes differ, inflateRawSync restores them)', () => {
    const body = new TextEncoder().encode('abcabcabc'.repeat(30));
    const archive = buildZipArchive([{ name: 'a.nc', bytes: body }], { method: 8 });
    expect(Buffer.from(archive).includes(Buffer.from(body))).toBe(false);
    // Extract the deflated body straight off the local header and round-trip it.
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const compressedSize = view.getUint32(18, true);
    const start = 30 + nameLength + extraLength;
    const restored = inflateRawSync(archive.subarray(start, start + compressedSize));
    expect(Array.from(restored)).toEqual(Array.from(body));
  });
});
