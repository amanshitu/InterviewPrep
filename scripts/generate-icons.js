// Generates the PWA icon PNGs with zero dependencies (pure Node: zlib +
// a hand-rolled CRC32), so no image library / native module / network
// fetch is needed. Draws a flat brand-color square with a white checkmark
// — simple on purpose; swap for real artwork later if desired.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PRIMARY = [0x37, 0x30, 0xa3]; // matches --primary in styles.css
const OUT_DIR = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(OUT_DIR, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Distance from point p to segment (a,b).
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function renderIcon(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const thickness = size * 0.055;
  // Checkmark in normalized [0,1] coords, matching the shield glyph's feel.
  const seg1 = [0.28, 0.52, 0.43, 0.67];
  const seg2 = [0.43, 0.67, 0.74, 0.32];

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const d1 = distToSegment(u, v, seg1[0], seg1[1], seg1[2], seg1[3]);
      const d2 = distToSegment(u, v, seg2[0], seg2[1], seg2[2], seg2[3]);
      const onCheck = Math.min(d1, d2) < thickness / size;
      const off = rowStart + 1 + x * 4;
      if (onCheck) {
        raw[off] = 255; raw[off + 1] = 255; raw[off + 2] = 255; raw[off + 3] = 255;
      } else {
        raw[off] = PRIMARY[0]; raw[off + 1] = PRIMARY[1]; raw[off + 2] = PRIMARY[2]; raw[off + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// A classic favicon.ico is still what some browsers/crawlers probe for
// directly regardless of <link rel="icon">. ICO's format allows embedding
// a plain PNG as one "image" entry (supported since Vista-era Windows and
// every modern browser) — much simpler than hand-rolling BMP/DIB data.
function buildIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width (0 means 256)
  entry[1] = size >= 256 ? 0 : size; // height
  entry[2] = 0; // color count (0 = PNG/no palette)
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(pngBuffer.length, 8); // bytes in resource
  entry.writeUInt32LE(header.length + entry.length, 12); // offset

  return Buffer.concat([header, entry, pngBuffer]);
}

const png32 = renderIcon(32);
const png192 = renderIcon(192);
const png512 = renderIcon(512);

fs.writeFileSync(path.join(OUT_DIR, "icon-32.png"), png32);
fs.writeFileSync(path.join(OUT_DIR, "icon-192.png"), png192);
fs.writeFileSync(path.join(OUT_DIR, "icon-512.png"), png512);
fs.writeFileSync(path.join(__dirname, "..", "public", "favicon.ico"), buildIco(png32, 32));

console.log("Wrote icons/icon-32.png, icons/icon-192.png, icons/icon-512.png, favicon.ico");
