/* vault.js — where EVE's secrets live, and how they stay out of everything else.
 *
 * Tokens that open your front door must never reach a log file, a generated
 * adapter, an error message or a git commit. The vault holds them, hands them
 * out by name, and redacts them from anything on its way to disk or a screen.
 *
 * Secrets come from the environment or a 0600 file, never from source.
 */
"use strict";

const fs = require("fs");
const path = require("path");

class Vault {
  constructor({ file, env = process.env } = {}) {
    this.secrets = new Map();
    this.file = file || null;
    this._loadEnv(env);
    if (file && fs.existsSync(file)) this._loadFile(file);
  }

  /** EVE_SECRET_HA_TOKEN=… becomes the secret "ha_token". */
  _loadEnv(env) {
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith("EVE_SECRET_") && value) {
        this.secrets.set(key.slice("EVE_SECRET_".length).toLowerCase(), value);
      }
    }
    // Long-standing names from before the vault existed, so nothing breaks.
    if (env.HA_TOKEN) this.secrets.set("ha_token", env.HA_TOKEN);
  }

  _loadFile(file) {
    const stat = fs.statSync(file);
    // World- or group-readable secrets are a finding, not a detail.
    if ((stat.mode & 0o077) !== 0) {
      throw new Error(`${file} is readable by other users (mode ${(stat.mode & 0o777).toString(8)}). Run: chmod 600 ${file}`);
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) this.secrets.set(name.toLowerCase(), value);
    }
  }

  has(name) { return this.secrets.has(String(name).toLowerCase()); }

  /** Fetch a secret. Throws rather than returning undefined, so a missing
   *  credential fails loudly instead of silently sending an empty token. */
  get(name) {
    const key = String(name).toLowerCase();
    if (!this.secrets.has(key)) {
      throw new Error(`No secret named "${key}". Set EVE_SECRET_${key.toUpperCase()} or add it to your secrets file.`);
    }
    return this.secrets.get(key);
  }

  /** Names only — never values. Safe to print. */
  names() { return [...this.secrets.keys()]; }

  set(name, value) {
    this.secrets.set(String(name).toLowerCase(), value);
    return this;
  }

  /**
   * Replace every known secret with a marker, anywhere in a structure.
   * Also masks fields *named* like credentials, since an unknown token is
   * still a token. Everything bound for a log or the screen goes through here.
   */
  redact(value, seen = new Set()) {
    const SENSITIVE_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|credential|bearer)/i;

    const scrub = (text) => {
      let out = String(text);
      for (const secret of this.secrets.values()) {
        if (secret && secret.length >= 6) out = out.split(secret).join("«redacted»");
      }
      return out;
    };

    if (typeof value === "string") return scrub(value);
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return "«circular»";
    seen.add(value);

    if (Array.isArray(value)) return value.map((v) => this.redact(v, seen));
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) && v ? "«redacted»" : this.redact(v, seen);
    }
    return out;
  }

  /** True if a blob of text would leak a secret — used to vet generated code. */
  wouldLeak(text) {
    const body = String(text);
    for (const secret of this.secrets.values()) {
      if (secret && secret.length >= 6 && body.includes(secret)) return true;
    }
    return false;
  }

  /** Write secrets back, with permissions that do not embarrass us. */
  save(file = this.file) {
    if (!file) throw new Error("No secrets file configured.");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(this.secrets), null, 1), { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  }
}

module.exports = { Vault };
