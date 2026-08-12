/* storage.js — writes that survive the power being cut mid-write.
 *
 * A Raspberry Pi with an inline on/off switch loses power without warning, and
 * a plain writeFileSync interrupted halfway leaves a truncated, unparseable
 * file. EVE's model weights, learned API descriptions and generated adapters
 * are exactly the files you cannot afford to find half-written.
 *
 * So every write here is atomic: write a temporary file, flush it to the card,
 * then rename over the target. Rename is atomic on ext4, so at any instant the
 * real file is either entirely the old version or entirely the new one — never
 * a fragment. The cost is one extra file operation, which an SD card barely
 * notices next to the write itself.
 */
"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Write a file so a power cut can never leave it corrupt.
 * `fsync` forces the card to actually persist before the rename, at the cost of
 * a little speed — worth it for anything you would hate to lose.
 */
function writeAtomic(file, contents, { mode = 0o644, fsync = true } = {}) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);

  let handle;
  try {
    handle = fs.openSync(temp, "w", mode);
    fs.writeFileSync(handle, contents);
    if (fsync) fs.fsyncSync(handle);   // on the card, not just in a buffer
    fs.closeSync(handle);
    handle = null;
    fs.renameSync(temp, file);          // the atomic moment
  } catch (err) {
    if (handle != null) { try { fs.closeSync(handle); } catch { /* already closing */ } }
    try { fs.unlinkSync(temp); } catch { /* nothing to clean up */ }
    throw err;
  }
}

const writeJsonAtomic = (file, value, options) =>
  writeAtomic(file, JSON.stringify(value), options);

/**
 * Read JSON that might have been damaged anyway — by a power cut during an
 * older non-atomic write, or a card going bad. Returns `fallback` instead of
 * throwing, and reports what happened, so EVE can rebuild rather than refuse
 * to start.
 */
function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return { value: fallback, ok: true, reason: "not present" };
    const text = fs.readFileSync(file, "utf8");
    if (!text.trim()) return { value: fallback, ok: false, reason: "file is empty — likely an interrupted write" };
    return { value: JSON.parse(text), ok: true, reason: null };
  } catch (err) {
    return { value: fallback, ok: false, reason: `unreadable (${err.message}) — treating as missing` };
  }
}

/** Keep one previous copy, so a bad write still has something to fall back to. */
function writeJsonVersioned(file, value, options) {
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.prev`);
  } catch { /* a missing backup must not stop the write */ }
  writeJsonAtomic(file, value, options);
}

/** The previous copy, when the current one turns out to be broken. */
function readWithFallback(file, fallback = null) {
  const primary = readJsonSafe(file, null);
  if (primary.ok && primary.value !== null) return primary;
  const previous = readJsonSafe(`${file}.prev`, null);
  if (previous.ok && previous.value !== null) {
    return { value: previous.value, ok: true, reason: `recovered from ${path.basename(file)}.prev — the newer copy was ${primary.reason}` };
  }
  return { value: fallback, ok: false, reason: primary.reason };
}

module.exports = { writeAtomic, writeJsonAtomic, writeJsonVersioned, readJsonSafe, readWithFallback };
