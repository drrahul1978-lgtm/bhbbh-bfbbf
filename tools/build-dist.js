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
  "nn.js", "intent.js", "learn.js", "chat.js", "voice.js", "hearing.js",
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

/* The desktop app opens on her own page, which is now all of her at once:
 * hearing you, watching through the camera, answering, and learning. The eye
 * trainer — teaching her specific objects — is one click from there.
 *
 * Nothing is renamed: index.html is already her page and eye.html is already
 * the trainer, so the links in both files are correct as written. An earlier
 * version shuffled the two and had to rewrite every href to match, which is a
 * step that can only ever go wrong. */
console.log(`dist/ ready — ${SHIP.length} files, ${(bytes / 1024).toFixed(0)}KB`);
console.log(`the app opens on her page — voice, eye and conversation together`);
