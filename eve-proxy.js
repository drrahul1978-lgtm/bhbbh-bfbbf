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
 * The key comes from the vault: EVE_SECRET_GROQ_API_KEY, or eve-data/secrets.json.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const kernel = require("./eve/kernel/index.js");
const { Evaluator } = require("./eve/review/evaluator.js");
const { makeGroqTransport } = require("./eve/review/groq.js");
const { CaseStore } = require("./eve/review/cases.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const PORT = parseInt(flag("port", process.env.PORT || "8080"), 10);
const REVIEW = !args.includes("--no-review");

const eve = kernel.boot({ confirm: null });   // no interactive human behind a web request
const log = eve.log;

/* The grading key, if one is configured. Read at call time, never held in a
 * closure that might end up in a log line. */
const GRADING_SECRET = "groq_api_key";
const hasKey = () => eve.vault.has(GRADING_SECRET);

/* The background reviewer. It looks at grades after they have been sent, files
 * what it finds, and is never mentioned to the visitor. */
const cases = new CaseStore({ file: path.join(eve.config.dataDir, "cases.json"), log, privacy: "disputed_exchange_only" });
const evaluator = new Evaluator({ transport: makeGroqTransport({ vault: eve.vault }), log });

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

/** Ask the provider to grade an image. The key is added here and only here. */
async function gradeWithProvider(imageDataUrl) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${eve.vault.get(GRADING_SECRET)}` },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.2, max_tokens: 1024,
      messages: [{ role: "user", content: [
        { type: "text", text: GRADING_PROMPT },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ] }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Never echo the request back: it carried the key.
    throw new Error(res.status === 401 ? "the grading key was rejected" : `the provider replied ${res.status}: ${detail.slice(0, 160)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("the provider did not return a readable grade");
  return JSON.parse(match[0]);
}

/**
 * Review a grade after it has already been sent to the visitor.
 *
 * Deliberately invisible and deliberately after the fact: it cannot delay the
 * answer, cannot change it, and cannot fail in a way the visitor sees. What it
 * finds is filed for you to look at later.
 */
function reviewInBackground(grade) {
  if (!REVIEW || !evaluator.available()) return;
  setImmediate(async () => {
    try {
      const opened = cases.open({
        question: "Grade this trading card from a photo",
        answer: JSON.stringify(grade),
        why: grade.confidence === "low" ? "the grader said its own confidence was low" : "routine spot check",
        confidence: grade.confidence === "high" ? 0.9 : grade.confidence === "medium" ? 0.6 : 0.3,
        tools: ["vision grading"],
      });
      // Only the disputed exchange leaves — no photo, no conversation.
      const review = await evaluator.review(cases.payloadFor(opened.id));
      cases.attachEvaluation(opened.id, review);
      if (review.available && !review.correct) {
        log.info("the background reviewer disagreed with a grade", {
          case: opened.id, error_type: review.error_type, explanation: review.explanation,
        });
      }
    } catch (err) {
      // A reviewer having a bad day must never be a visitor's problem.
      log.warn("background review failed", { error: err.message });
    }
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
      grading: hasKey() ? "available" : "not configured",
      reviewer: REVIEW && evaluator.available() ? "on" : "off",
      host: eve.platform.host,
    });
  }

  if (url.pathname === "/api/grade" && req.method === "POST") {
    if (!hasKey()) {
      return send(503, { error: "This server has no grading key configured, so use Eve — she needs none." });
    }
    try {
      const { image } = JSON.parse(await readBody(req));
      if (!image || !image.startsWith("data:image/")) return send(400, { error: "send an image" });
      const grade = await gradeWithProvider(image);
      send(200, grade);              // the visitor is answered first…
      reviewInBackground(grade);     // …and the reviewer runs afterwards, unseen
    } catch (err) {
      log.warn("grading failed", { error: err.message });
      send(502, { error: err.message });
    }
    return;
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
  log.info(`serving on port ${PORT}`, { grading: hasKey(), reviewer: REVIEW && evaluator.available() });
  console.log(`\n🧠 EVE is serving on http://localhost:${PORT}`);
  console.log(`   ${eve.describe()}`);
  console.log(`   cloud grading: ${hasKey() ? "on — the key stays on this machine" : "off — set EVE_SECRET_GROQ_API_KEY to enable it"}`);
  console.log(`   background reviewer: ${REVIEW && evaluator.available() ? "on, and invisible to visitors" : "off"}`);
  console.log(`\n   Visitors need no key, no account and no settings.\n`);
});

process.on("SIGINT", () => { eve.shutdown(); server.close(() => process.exit(0)); });
module.exports = { server };
