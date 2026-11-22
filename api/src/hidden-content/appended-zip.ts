import { inflateRawSync } from "node:zlib";
import { collectCandidateText } from "./hidden-text.js";
export type AppendedZipEvidence = { status: string; entries: number; encryptedEntries: number; texts: string[] };
const absent = (): AppendedZipEvidence => ({ status: "no_recognized_appended_zip", entries: 0, encryptedEntries: 0, texts: [] });
export function inspectAppendedZip(bytes: Buffer): AppendedZipEvidence {
  if (bytes.length > 16 * 1024 * 1024) return { ...absent(), status: "input_size_limit" };
  try {
    const end = mediaEnd(bytes);
    if (end === null || bytes.length - end < 22) return absent();
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(end, bytes.length - 65557); i--) {
      if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { eocd = i; break; }
    }
    if (eocd < 0) return absent();
    const count = bytes.readUInt16LE(eocd + 10), size = bytes.readUInt32LE(eocd + 12), offset = bytes.readUInt32LE(eocd + 16);
    if (bytes.readUInt16LE(eocd + 4) || bytes.readUInt16LE(eocd + 6) || bytes.readUInt16LE(eocd + 8) !== count ||
        count < 1 || count > 8 || size > 65536 || offset === 0xffffffff) return { ...absent(), status: "zip_layout_outside_limits" };
    const centralStart = eocd - size, base = centralStart - offset;
    if (base < end || base - end > 65536 || centralStart < base) return absent();
    let cursor = centralStart, encrypted = 0;
    const texts: string[] = [];
    for (let entry = 0; entry < count; entry++) {
      if (cursor + 46 > eocd || bytes.readUInt32LE(cursor) !== 0x02014b50) return absent();
      const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
      const crc = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), uncompressed = bytes.readUInt32LE(cursor + 24);
      const nameLength = bytes.readUInt16LE(cursor + 28), next = cursor + 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
      const localOffset = bytes.readUInt32LE(cursor + 42), local = base + localOffset;
      if (nameLength > 1024 || next > eocd || bytes.readUInt16LE(cursor + 34) ||
          compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff || local < base ||
          local + 30 > centralStart || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags ||
          bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 26) !== nameLength) return absent();
      const start = local + 30 + nameLength + bytes.readUInt16LE(local + 28);
      if (start > centralStart || compressed > centralStart - start ||
          !bytes.subarray(local + 30, local + 30 + nameLength).equals(bytes.subarray(cursor + 46, cursor + 46 + nameLength))) return absent();
      if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== uncompressed)) return absent();
      if (flags & 1) encrypted++;
      else if ((method === 0 || method === 8) && compressed <= 8192 && uncompressed <= 8192) {
        try {
          const encoded = bytes.subarray(start, start + compressed);
          const plain = method === 0 ? encoded : inflateRawSync(encoded, { maxOutputLength: 8192 });
          if (plain.length === uncompressed && crc32(plain) === crc) collectCandidateText(plain, texts);
        } catch { /* Reject broken/oversized inflation, never use partial data. */ }
      }
      cursor = next;
    }
    return cursor === eocd ? { status: "recognized_appended_zip", entries: count, encryptedEntries: encrypted, texts } : absent();
  } catch { return { ...absent(), status: "malformed_or_unsupported_container" }; }
}
function mediaEnd(b: Buffer): number | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    let p = 8;
    for (let n = 0; n < 4096 && p + 12 <= b.length; n++) {
      const size = b.readUInt32BE(p);
      if (size > b.length - p - 12) return null;
      if (b.toString("ascii", p + 4, p + 8) === "IEND" && !size && b.readUInt32BE(p + 8) === 0xae426082) return p + 12;
      p += size + 12;
    }
  } else if (b[0] === 255 && b[1] === 216) {
    let p = 2, markers = 0, entropy = false;
    while (p < b.length && markers < 4096) {
      if (entropy) {
        while (p < b.length && b[p] !== 255) p++;
        if (p + 1 >= b.length) return null;
        if (b[p + 1] === 0 || b[p + 1] >= 208 && b[p + 1] <= 215) { p += 2; continue; }
      }
      if (b[p] !== 255) return null;
      while (p < b.length && b[p] === 255) p++;
      if (p >= b.length) return null;
      const marker = b[p++]; markers++;
      if (marker === 217) return p;
      if (marker === 1) { entropy = false; continue; }
      if (p + 2 > b.length) return null;
      const size = b.readUInt16BE(p);
      if (size < 2 || size > b.length - p) return null;
      p += size; entropy = marker === 218;
    }
  } else if (b.toString("ascii", 0, 2) === "BM") {
    const size = b.readUInt32LE(2); if (size >= 54 && size <= b.length) return size;
  } else if (b.toString("ascii", 0, 4) === "RIFF") {
    const size = b.readUInt32LE(4) + 8; if (size >= 12 && size <= b.length) return size;
  } else if (b.toString("ascii", 4, 8) === "ftyp") {
    let p = 0;
    for (let n = 0; n < 4096 && p + 8 <= b.length; n++) {
      let size = b.readUInt32BE(p); const header = size === 1 ? 16 : 8;
      if (size === 0) return b.length; // Extends to EOF; a trailer is inside this box.
      if (size === 1) { if (p + 16 > b.length) return null; const large = b.readBigUInt64BE(p + 8); if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null; size = Number(large); }
      if (size < header || size > b.length - p) return p > 0 ? p : null;
      p += size;
      if (p === b.length) return p;
    }
  }
  return null;
}
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? crc >>> 1 ^ 0xedb88320 : crc >>> 1; }
  return (crc ^ 0xffffffff) >>> 0;
}
