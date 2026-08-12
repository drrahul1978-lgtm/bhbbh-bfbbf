/* log.js — structured logging that a Raspberry Pi's SD card can survive.
 *
 * Two Pi-specific choices drive this file. Writes are BUFFERED and flushed on a
 * timer, because a log line per event on a cheap SD card is how those cards die.
 * And every record passes through the vault's redaction on the way out, so a
 * token can never reach disk just because it happened to be in an error message.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

class Logger {
  constructor({ file = null, level = "info", vault = null, console: toConsole = true,
                flushMs = 2000, maxBytes = 2 * 1024 * 1024 } = {}) {
    this.file = file;
    this.level = LEVELS[level] ?? LEVELS.info;
    this.vault = vault;
    this.toConsole = toConsole;
    this.maxBytes = maxBytes;
    this.buffer = [];
    this.timer = null;
    this.flushMs = flushMs;
    if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  _emit(level, kind, message, data) {
    if (LEVELS[level] < this.level) return;
    const record = {
      at: new Date().toISOString(),
      level,
      kind,
      message: typeof message === "string" ? message : undefined,
      data: data === undefined ? undefined : data,
    };
    // Redact once, at the boundary, so nothing downstream has to remember to.
    const safe = this.vault ? this.vault.redact(record) : record;
    if (this.toConsole && LEVELS[level] >= LEVELS.warn) {
      console.error(`[${level}] ${safe.message || kind}`);
    }
    if (this.file) {
      this.buffer.push(JSON.stringify(safe));
      this._scheduleFlush();
    }
    return safe;
  }

  _scheduleFlush() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.flushMs);
    // Never hold the process open just to write a log line.
    if (this.timer.unref) this.timer.unref();
  }

  /** Write buffered lines in one go — one disk touch instead of dozens. */
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.file || !this.buffer.length) return;
    const payload = this.buffer.join("\n") + "\n";
    this.buffer = [];
    try {
      this._rotateIfNeeded();
      fs.appendFileSync(this.file, payload);
    } catch (err) {
      console.error(`[warn] could not write the log: ${err.message}`);
    }
  }

  /** One rollover file, so logs cannot quietly fill a small SD card. */
  _rotateIfNeeded() {
    try {
      if (fs.existsSync(this.file) && fs.statSync(this.file).size > this.maxBytes) {
        fs.renameSync(this.file, `${this.file}.1`);
      }
    } catch { /* rotation is best effort */ }
  }

  debug(m, d) { return this._emit("debug", "message", m, d); }
  info(m, d) { return this._emit("info", "message", m, d); }
  warn(m, d) { return this._emit("warn", "message", m, d); }
  error(m, d) { return this._emit("error", "message", m, d); }

  /** A structured happening — audit entries, permission decisions, health ticks. */
  event(kind, data) { return this._emit("info", kind, undefined, data); }

  close() { this.flush(); }
}

module.exports = { Logger, LEVELS };
