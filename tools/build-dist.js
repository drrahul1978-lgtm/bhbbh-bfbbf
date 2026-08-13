#!/usr/bin/env node
/* build-dist.js — gather the files the desktop app ships with.
 *
 * There is no bundler here and there does not need to be: the app is plain
 * HTML, CSS and JavaScript with no imports to resolve. This copies exactly what
 * the app uses into dist/, which is what Tauri packages.
 *
 * Being an explicit list rather than "copy everything" is the point. The vault,
 * her memory, the skills she has written, the tests and the server all stay out
 * of the installer — none of them belong in something you hand to someone.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const SHIP = [
  // Pages
  "eye.html", "index.html", "style.css", "eye.webmanifest",
  // Her mind
  "nn.js", "intent.js", "learn.js",
  "eve/vision/scene.js", "eve/vision/recognise.js",
  // Page logic
  "eye.js", "app.js",
  // What she has already learned
  "eve-intent.json",
  // Writing her own adapters
  "skills.js", "discover.js",
];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let bytes = 0;
const missing = [];
for (const file of SHIP) {
  const from = path.join(ROOT, file);
  if (!fs.existsSync(from)) { missing.push(file); continue; }
  const to = path.join(DIST, file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  bytes += fs.statSync(from).size;
}

if (missing.length) {
  console.error(`Missing files the app needs: ${missing.join(", ")}`);
  process.exit(1);
}

/* The desktop app opens on her eye — the camera is the reason it exists as an
 * app rather than a page. Talking to her is one click from there. */
fs.renameSync(path.join(DIST, "index.html"), path.join(DIST, "talk.html"));
fs.renameSync(path.join(DIST, "eye.html"), path.join(DIST, "index.html"));

// The renamed pages have to stay linked correctly to each other.
for (const page of ["index.html", "talk.html"]) {
  const file = path.join(DIST, page);
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(/href="index\.html"/g, 'href="talk.html"').replace(/href="eye\.html"/g, 'href="index.html"');
  fs.writeFileSync(file, html);
}

console.log(`dist/ ready — ${SHIP.length} files, ${(bytes / 1024).toFixed(0)}KB`);
console.log(`the app opens on her eye; talking to her is one click away`);
