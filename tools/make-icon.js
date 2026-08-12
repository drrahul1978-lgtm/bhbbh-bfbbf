#!/usr/bin/env node
/* make-icon.js — EVE's app icon, drawn and encoded from nothing.
 *
 * The rest of this project has no dependencies, and the icon is not going to be
 * the thing that introduces one. PNG is a container around zlib-compressed
 * scanlines, and Node has zlib, so the whole encoder is about thirty lines.
 *
 *   node tools/make-icon.js            writes src-tauri/icons/source.png
 *
 * Tauri's CLI turns that one file into every size Windows, macOS and Linux
 * want, including the .ico — that runs in CI, where the CLI is installed.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 1024;

/** A PNG is a signature, a header chunk, the pixels, and an end marker. */
function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;      // bits per channel
  header[9] = 6;      // colour type: RGBA
  // 10-12: deflate, standard filtering, no interlacing — all zero.

  // Each scanline is prefixed with its filter type; 0 means "stored as is".
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/* ── the icon itself ──────────────────────────────────────────────────────
 * An eye, in her colours: the dark of the site, the yellow of her accent, and
 * the blue used for what she is looking at. Drawn with distance fields rather
 * than paths, because there is no canvas here — and supersampled, because an
 * icon with jagged edges looks like a mistake.
 */
const BACKGROUND = [11, 14, 23];
const ACCENT = [255, 203, 5];
const IRIS = [61, 125, 202];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Coverage of the eye shape at a point: two arcs meeting at the corners. */
function eyeCoverage(x, y) {
  const cx = 0.5, cy = 0.5;
  const halfWidth = 0.36, halfHeight = 0.22;
  // An ellipse gives the almond; the curvature is what makes it read as an eye.
  const dx = (x - cx) / halfWidth;
  const dy = (y - cy) / halfHeight;
  return dx * dx + dy * dy;
}

function pixel(x, y) {
  // Rounded-square background, the way app icons are shaped.
  const corner = 0.18;
  const inset = Math.max(
    Math.abs(x - 0.5) - (0.5 - corner),
    Math.abs(y - 0.5) - (0.5 - corner)
  );
  const outside = inset > 0 && Math.hypot(
    Math.max(0, Math.abs(x - 0.5) - (0.5 - corner)),
    Math.max(0, Math.abs(y - 0.5) - (0.5 - corner))
  ) > corner;
  if (outside) return [0, 0, 0, 0];

  const eye = eyeCoverage(x, y);
  const irisDistance = Math.hypot(x - 0.5, y - 0.5);

  if (eye > 1) return [...BACKGROUND, 255];                    // around the eye
  if (irisDistance < 0.075) return [...mix(IRIS, [0, 0, 0], 0.75), 255];  // pupil
  if (irisDistance < 0.145) return [...IRIS, 255];             // iris
  if (eye > 0.82) return [...mix(ACCENT, BACKGROUND, 0.35), 255]; // lash line
  return [...ACCENT, 255];                                      // the white, in her yellow
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const SAMPLES = 3;   // supersampling, so the curves are not jagged
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const [pr, pg, pb, pa] = pixel(
            (px + (sx + 0.5) / SAMPLES) / size,
            (py + (sy + 0.5) / SAMPLES) / size
          );
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      }
      const n = SAMPLES * SAMPLES;
      const i = (py * size + px) * 4;
      rgba[i] = a ? Math.round(r / a) : 0;
      rgba[i + 1] = a ? Math.round(g / a) : 0;
      rgba[i + 2] = a ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

/**
 * A Windows .ico is a small table of images. Since Vista each entry may be a
 * PNG rather than a bitmap, which means the encoder above does all the work and
 * this is just the index in front of it.
 */
function encodeIco(images) {
  const HEADER = 6, ENTRY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = HEADER + ENTRY * images.length;
  const entries = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(ENTRY);
    entry[0] = size >= 256 ? 0 : size;     // 0 means 256
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;                          // no palette; this is truecolour
    entry[3] = 0;                          // reserved
    entry.writeUInt16LE(1, 4);             // colour planes
    entry.writeUInt16LE(32, 6);            // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const icons = path.join(__dirname, "..", "src-tauri", "icons");
fs.mkdirSync(icons, { recursive: true });

// The sizes Tauri's config names, plus the ones Windows actually shows.
const PNG_SIZES = { "source.png": 1024, "32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256, "icon.png": 512 };
const rendered = new Map();
const render = (size) => {
  if (!rendered.has(size)) rendered.set(size, encodePng(size, size, draw(size)));
  return rendered.get(size);
};

for (const [name, size] of Object.entries(PNG_SIZES)) {
  fs.writeFileSync(path.join(icons, name), render(size));
}

// Windows picks whichever size it needs from inside the one .ico file.
fs.writeFileSync(path.join(icons, "icon.ico"),
  encodeIco([16, 32, 48, 64, 128, 256].map((size) => ({ size, png: render(size) }))));

console.log(`wrote ${Object.keys(PNG_SIZES).length + 1} icon files to ${path.relative(process.cwd(), icons)}/`);
console.log(`  icon.ico carries 16, 32, 48, 64, 128 and 256px — Windows chooses`);
