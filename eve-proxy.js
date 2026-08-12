#!/usr/bin/env node
/* eve-proxy.js — the Pi holds the key, so nobody else has to.
 *
 * The goal is that a visitor does nothing: open the page, upload a card, get a
 * grade. No settings, no account, no key.
 *
 * The way NOT to do that is to put the key in the page. Anything in client-side
 * JavaScript is readable by anyone who opens it — obfuscating it only hides it
 * from scanners, and published keys get found and drained within days. Then it
 * works for nobody, including you.
 *
 * So the key stays here, on your machine, in the vault. The browser asks this
 * server, this server asks the provider, and the key never leaves the Pi. The
 * visitor's experience is identical to having it embedded; the difference is
 * that it keeps working.
 *
 *   node eve-proxy.js                  serves the site and grades on port 8080
 *   node eve-proxy.js --port 3000
 *   node eve-proxy.js --no-review      skip the background reviewer
 *
 * There is no API key in this project any more — not here, not in the page, not
 * in the vault. Grading happens in the visitor's browser, and Eve checks her own
 * work by disagreeing with herself rather than by asking anyone.
 *
 * The rate limits below remain because this server still writes to disk when a
 * disagreement is filed, and an open endpoint that writes to a 32GB card is
 * worth defending even when nothing costs money.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const kernel = require("./eve/kernel/index.js");
const { CaseStore } = require("./eve/review/cases.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const PORT = parseInt(flag("port", process.env.PORT || "8080"), 10);
const REVIEW = !args.includes("--no-review");

/* What you are prepared to pay for. A leaked address costs you this much and
 * then stops, rather than costing you everything overnight. */
const PER_MINUTE = parseInt(flag("per-minute", process.env.EVE_RATE_PER_MINUTE || "6"), 10);
const PER_DAY = parseInt(flag("per-day", process.env.EVE_RATE_PER_DAY || "200"), 10);

const eve = kernel.boot({ confirm: null });   // no interactive human behind a web request
const log = eve.log;

/**
 * A shared token clients must send, if you set one.
 *
 * Honest about what it is: it ships with your app, so anyone holding the app
 * can extract it. What it buys is that a stranger who merely finds the address
 * cannot use it, and that you can change it in one place when it leaks.
 */
const APP_TOKEN = flag("app-token", process.env.EVE_APP_TOKEN || null);

/* Requests per address, in memory and bounded. Nothing here costs money any
 * more, but this endpoint writes to the SD card, and an open endpoint that
 * writes to a 32GB card is worth defending on its own account. */
const buckets = new Map();
const DAY_MS = 86400000;

function rateCheck(address) {
  const now = Date.now();
  let bucket = buckets.get(address);
  if (!bucket) {
    if (buckets.size > 5000) buckets.clear();   // a Pi will not hold an unbounded table
    bucket = { minute: [], day: [] };
    buckets.set(address, bucket);
  }
  bucket.minute = bucket.minute.filter((t) => now - t < 60000);
  bucket.day = bucket.day.filter((t) => now - t < DAY_MS);

  if (bucket.minute.length >= PER_MINUTE) return { allowed: false, retryAfter: 60, why: `more than ${PER_MINUTE} a minute from one address` };
  if (bucket.day.length >= PER_DAY) return { allowed: false, retryAfter: 3600, why: `the daily limit of ${PER_DAY} for this address` };
  bucket.minute.push(now);
  bucket.day.push(now);
  return { allowed: true };
}

/** Behind a router or reverse proxy the socket address is not the client. */
const addressOf = (req) =>
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";

/* Nothing here holds a credential any more, and nothing here calls out.
 * The site is served; Eve grades in the browser, and checks her own work by
 * debating herself (eve/debate/). Cases she cannot settle are filed for you. */
const cases = new CaseStore({ file: path.join(eve.config.dataDir, "cases.json"), log, privacy: "disputed_exchange_only" });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const GRADING_PROMPT = fs.readFileSync(path.join(__dirname, "app.js"), "utf8")
  .match(/const GRADING_PROMPT = `([\s\S]*?)`;/)?.[1] || "Grade this trading card and reply with JSON.";

const readBody = (req, limit = 12 * 1024 * 1024) => new Promise((resolve, reject) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > limit) { reject(new Error("that image is too large")); req.destroy(); }
  });
  req.on("end", () => resolve(body));
});

/**
 * File a disagreement Eve could not settle herself.
 *
 * The browser sends these when her two methods disagree and the measurements
 * did not decide it. Nothing leaves this machine — the case is written to disk
 * for you to rule on, and the photograph is never part of it.
 */
function fileDisagreement(payload) {
  return cases.open({
    question: payload.question || "Grade this trading card from a photo",
    answer: payload.answer,
    why: payload.why || "her two methods disagreed and the evidence did not settle it",
    confidence: payload.confidence ?? null,
    tools: ["eve one", "eve two"],
    research: payload.transcript || null,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };

  // Does this host offer cloud grading? The page asks before deciding what to show.
  if (url.pathname === "/api/health") {
    return send(200, {
      // No cloud grading exists any more, so the page never looks for one.
      grading: "local",
      reviewer: REVIEW ? "eve debates eve" : "off",
      host: eve.platform.host,
    });
  }

  // A disagreement Eve could not settle, filed for a human. No photo, no key.
  if (url.pathname === "/api/disagreement" && req.method === "POST") {
    if (APP_TOKEN && req.headers["x-eve-app"] !== APP_TOKEN) {
      return send(401, { error: "This server is not open to the public." });
    }
    try {
      const limit = rateCheck(addressOf(req));
      const payload = JSON.parse(await readBody(req, 256 * 1024));
      if (!limit.allowed) return send(429, { error: "too many at once" });
      const filed = fileDisagreement(payload);
      log.info("a disagreement was filed for review", { case: filed.id, why: filed.why });
      return send(200, { filed: filed.id });
    } catch (err) {
      return send(400, { error: err.message });
    }
  }

  // Everything else is the static site.
  const requested = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";

  // Refuse forbidden paths BEFORE touching the filesystem. Two reasons: by
  // default eve-data/ sits inside the directory being served, so this is the
  // only thing standing between the web and the vault; and answering 403
  // whether or not the file exists means the refusal itself discloses nothing.
  if (/^(eve-data|eve-skills)\b/.test(requested) || /secrets\.json$/.test(requested) || requested.includes("..")) {
    return send(403, { error: "not served" });
  }

  const file = path.join(__dirname, requested);
  if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(404, { error: "not found" });
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});

server.listen(PORT, () => {
  log.info(`serving on port ${PORT}`, { grading: "local", reviewer: REVIEW });
  console.log(`\n🧠 EVE is serving on http://localhost:${PORT}`);
  console.log(`   ${eve.describe()}`);
  console.log(`   grading: local — Eve runs in the visitor's browser, no key anywhere`);
  console.log(`   checking: ${REVIEW ? "Eve debates Eve; what she cannot settle is filed for you" : "off"}`);
  console.log(`   limits: ${PER_MINUTE}/minute and ${PER_DAY}/day per address${APP_TOKEN ? ", app token required" : ""}`);
  if (!APP_TOKEN) console.log(`   (set EVE_APP_TOKEN to refuse clients that are not yours)`);
  console.log(`\n   Visitors need no key, no account and no settings.\n`);
});

process.on("SIGINT", () => { eve.shutdown(); server.close(() => process.exit(0)); });
module.exports = { server };
