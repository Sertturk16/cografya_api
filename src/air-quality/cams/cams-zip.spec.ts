import { describe, expect, it, jest } from '@jest/globals';
import { buildZipArchive } from './netcdf3-fixture.builder';
import { CamsContractError } from './cams.errors';
import { extractSingleZipEntry } from './cams-zip';

const payload = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('extractSingleZipEntry', () => {
  it('returns the single STORED entry verbatim, with its recorded (never matched) name', () => {
    const body = payload('CDF-payload-bytes');
    const archive = buildZipArchive([{ name: 'ENS_FORECAST.nc', bytes: body }]);
    const entry = extractSingleZipEntry(archive);
    expect(entry.name).toBe('ENS_FORECAST.nc');
    expect(entry.method).toBe(0);
    expect(Array.from(entry.bytes)).toEqual(Array.from(body));
  });

  it('inflates a DEFLATE entry AND warns loudly (provider behaviour-change signal)', () => {
    const body = payload('deflate-me-'.repeat(50));
    const archive = buildZipArchive([{ name: 'ENS_FORECAST.nc', bytes: body }], { method: 8 });
    const warn = jest.fn();
    const entry = extractSingleZipEntry(archive, { warn });
    expect(entry.method).toBe(8);
    expect(Array.from(entry.bytes)).toEqual(Array.from(body));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('DEFLATE');
  });

  it('refuses a multi-entry archive — entry count ≠ 1 is a schema error, no name lookup', () => {
    const archive = buildZipArchive([
      { name: 'a.nc', bytes: payload('one') },
      { name: 'b.nc', bytes: payload('two') },
    ]);
    expect(() => extractSingleZipEntry(archive)).toThrow(CamsContractError);
    expect(() => extractSingleZipEntry(archive)).toThrow(/exactly ONE entry/);
  });

  it('refuses an empty archive', () => {
    const archive = buildZipArchive([]);
    expect(() => extractSingleZipEntry(archive)).toThrow(CamsContractError);
  });

  it('refuses non-ZIP bytes and truncated buffers', () => {
    expect(() => extractSingleZipEntry(payload('not a zip at all'))).toThrow(CamsContractError);
    expect(() => extractSingleZipEntry(new Uint8Array(3))).toThrow(CamsContractError);
  });

  it('refuses an unsupported compression method — no silent acceptance', () => {
    const archive = buildZipArchive([{ name: 'x.nc', bytes: payload('body') }]);
    // Patch the method field to 12 (bzip2) in BOTH the local and the central header.
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    view.setUint16(8, 12, true); // local header method
    const centralOffset = archive.byteLength - 22 - 46 - 'x.nc'.length;
    view.setUint16(centralOffset + 10, 12, true); // central directory method
    expect(() => extractSingleZipEntry(archive)).toThrow(/unsupported ZIP compression method/);
  });

  it('caps a DEFLATE entry whose declared inflated size exceeds the ceiling', () => {
    const body = payload('deflate-me-'.repeat(50));
    const archive = buildZipArchive([{ name: 'x.nc', bytes: body }], { method: 8 });
    expect(() =>
      extractSingleZipEntry(archive, { maxInflatedBytes: 16, warn: () => undefined }),
    ).toThrow(CamsContractError);
  });
});
