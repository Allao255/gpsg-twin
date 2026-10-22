import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, unzip, zip, type Inflate } from './zip';

const enc = new TextEncoder();
const dec = new TextDecoder();
const inflate: Inflate = (raw) => Promise.resolve(new Uint8Array(inflateRawSync(raw)));

/** ZIP de uma entrada com deflate (método 8), como o de um compactador comum. */
function deflatedZip(path: string, text: string, extra = new Uint8Array(0)): Uint8Array {
  const data = enc.encode(text);
  const comp = new Uint8Array(deflateRawSync(data));
  const name = enc.encode(path);
  const local = new Uint8Array(30 + name.length + extra.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, 8, true);
  lv.setUint32(14, crc32(data), true);
  lv.setUint32(18, comp.length, true);
  lv.setUint32(22, data.length, true);
  lv.setUint16(26, name.length, true);
  lv.setUint16(28, extra.length, true);
  local.set(name, 30);
  local.set(extra, 30 + name.length);
  const cd = new Uint8Array(46 + name.length);
  const cv = new DataView(cd.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(16, crc32(data), true);
  cv.setUint32(20, comp.length, true);
  cv.setUint32(24, data.length, true);
  cv.setUint16(28, name.length, true);
  cd.set(name, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, cd.length, true);
  ev.setUint32(16, local.length + comp.length, true);
  const out = new Uint8Array(local.length + comp.length + cd.length + end.length);
  out.set(local, 0);
  out.set(comp, local.length);
  out.set(cd, local.length + comp.length);
  out.set(end, local.length + comp.length + cd.length);
  return out;
}

describe('crc32', () => {
  it('valor de referência', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zip e unzip', () => {
  const entries = [
    { path: 'Instrument/Routes/twin_a.rte', data: enc.encode('<Route/>\n') },
    { path: 'Instrument/Waypoint/twin_ç.csv', data: enc.encode('a,b\n') },
    { path: 'vazio.txt', data: new Uint8Array(0) },
  ];

  it('ida e volta, nomes UTF-8', async () => {
    const back = await unzip(zip(entries));
    expect(back.map((e) => [e.path, dec.decode(e.data)])).toEqual(
      entries.map((e) => [e.path, dec.decode(e.data)]),
    );
  });

  it('determinístico byte a byte', () => {
    expect(zip(entries)).toEqual(zip(entries));
  });

  it('deflate com descompressor injetado; campo extra no cabeçalho local', async () => {
    const z = deflatedZip('a/b.txt', 'texto '.repeat(50), new Uint8Array([1, 2, 3, 4]));
    const [e] = await unzip(z, inflate);
    expect(e?.path).toBe('a/b.txt');
    expect(dec.decode(e?.data)).toBe('texto '.repeat(50));
    await expect(unzip(z)).rejects.toThrow(/deflate/);
  });

  it('diretórios ignorados', async () => {
    const z = zip([{ path: 'Instrument/', data: new Uint8Array(0) }, ...entries.slice(0, 1)]);
    expect((await unzip(z)).map((e) => e.path)).toEqual([entries[0]?.path]);
  });

  it('erros: não ZIP, CRC, método, estrutura', async () => {
    await expect(unzip(enc.encode('não é zip'))).rejects.toThrow(/não é um arquivo ZIP/);
    const z = zip(entries.slice(0, 1));
    const bad = z.slice();
    const k = 30 + (entries[0]?.path.length ?? 0);
    bad[k] = (bad[k] ?? 0) ^ 0xff;
    await expect(unzip(bad)).rejects.toThrow(/CRC/);
    const m = z.slice();
    const cdOff = new DataView(m.buffer).getUint32(m.length - 22 + 16, true);
    new DataView(m.buffer).setUint16(cdOff + 10, 12, true);
    await expect(unzip(m)).rejects.toThrow(/método de compressão 12/);
    const c = z.slice();
    new DataView(c.buffer).setUint32(cdOff, 0, true);
    await expect(unzip(c)).rejects.toThrow(/diretório central/);
    const l = z.slice();
    new DataView(l.buffer).setUint32(0, 0, true);
    await expect(unzip(l)).rejects.toThrow(/cabeçalho local/);
  });
});
