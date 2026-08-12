/* Her eye: can she learn the things you show her, and does she admit it when
 * she is looking at something she has never seen?
 * Run with:  node test/vision-eye.test.js  */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const scene = require("../eve/vision/scene.js");
const { Recogniser } = require("../eve/vision/recognise.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-eye-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

/** A synthetic "object": a coloured, textured blob on a background. */
function frame({ hue = 0, blobs = 6, size = 22, noise = 8, bg = 60, w = 160, h = 120, jitter = 0 }) {
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 12345 + jitter * 977;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < w * h; i++) {
    const v = bg + (rnd() - 0.5) * noise;
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  const rgb = (t) => [
    128 + 110 * Math.sin(t * 6.28), 128 + 110 * Math.sin(t * 6.28 + 2.1), 128 + 110 * Math.sin(t * 6.28 + 4.2),
  ];
  const [r, g, b] = rgb(hue);
  for (let n = 0; n < blobs; n++) {
    const cx = w * (0.3 + rnd() * 0.4), cy = h * (0.3 + rnd() * 0.4), rad = size * (0.6 + rnd() * 0.8);
    for (let y = Math.max(0, cy - rad); y < Math.min(h, cy + rad); y++) {
      for (let x = Math.max(0, cx - rad); x < Math.min(w, cx + rad); x++) {
        if (Math.hypot(x - cx, y - cy) > rad) continue;
        const i = (Math.round(y) * w + Math.round(x)) * 4;
        data[i] = r + (rnd() - 0.5) * 20; data[i + 1] = g + (rnd() - 0.5) * 20; data[i + 2] = b + (rnd() - 0.5) * 20;
      }
    }
  }
  return { data, width: w, height: h };
}

(async () => {
  // --- describing a frame with nothing learned ---
  const bright = scene.describe(frame({ hue: 0.1 }));
  assert.strictEqual(bright.features.length, scene.FEATURE_COUNT);
  assert.ok(bright.brightness > 0 && bright.brightness < 1);
  assert.ok(scene.report(bright).usable, "a normal frame should be usable");
  ok("a frame is described by measurable properties, with no training at all");

  // --- and knowing when it cannot see ---
  const dark = scene.describe({ data: new Uint8ClampedArray(160 * 120 * 4), width: 160, height: 120 });
  const darkReport = scene.report(dark);
  assert.strictEqual(darkReport.usable, false);
  assert.match(darkReport.notes[0], /too dark/);

  const flat = new Uint8ClampedArray(160 * 120 * 4).fill(200);
  const flatReport = scene.report(scene.describe({ data: flat, width: 160, height: 120 }));
  assert.strictEqual(flatReport.usable, false);
  assert.ok(flatReport.notes.some((n) => /flat and featureless|washed out/.test(n)));
  ok("a dark lens or a blank wall is reported as unusable, not guessed at");

  // --- motion needs no teaching ---
  const still = scene.describe(frame({ hue: 0.3, jitter: 1 }));
  const same = scene.describe(frame({ hue: 0.3, jitter: 1 }), still);
  const moved = scene.describe(frame({ hue: 0.3, jitter: 9, blobs: 9 }), still);
  assert.ok(moved.motion > same.motion, "a changed frame should register more motion");
  assert.ok(scene.report(moved).notes.some((n) => /moving/.test(n)));
  ok("movement is detected by comparing frames — no training required");

  // --- teaching her objects ---
  const eye = new Recogniser({ file: path.join(tmp, "eye.json") });
  assert.strictEqual(eye.recognise(frame({ hue: 0.1 })).label, null);
  assert.match(eye.recognise(frame({ hue: 0.1 })).reason, /not shown me anything/);
  ok("before being taught she says she has been shown nothing, rather than guessing");

  for (let i = 0; i < 8; i++) eye.learn("red mug", frame({ hue: 0.0, blobs: 5, size: 26, jitter: i }));
  for (let i = 0; i < 8; i++) eye.learn("green plant", frame({ hue: 0.33, blobs: 14, size: 12, jitter: i }));

  const learning = eye.learn("red mug", frame({ hue: 0.0, jitter: 20 }));
  assert.strictEqual(learning.learned, true);
  assert.ok(learning.examples >= 9);
  assert.match(learning.advice, /angles/);
  ok("she learns from examples you show her and says when she has enough");

  const mug = eye.recognise(frame({ hue: 0.0, blobs: 5, size: 26, jitter: 99 }));
  assert.strictEqual(mug.label, "red mug", `expected the mug, got ${mug.label}: ${mug.reason}`);
  assert.ok(mug.confidence > 0.4);

  const plant = eye.recognise(frame({ hue: 0.33, blobs: 14, size: 12, jitter: 98 }));
  assert.strictEqual(plant.label, "green plant", `expected the plant, got ${plant.label}: ${plant.reason}`);
  ok("she recognises the two things she was taught, from views she never saw");

  // --- the important one: something she has never seen ---
  const stranger = eye.recognise(frame({ hue: 0.62, blobs: 30, size: 6, noise: 40, bg: 150 }));
  assert.strictEqual(stranger.label, null, `she should not have named this: ${stranger.reason}`);
  assert.ok(stranger.unknown || stranger.ambiguous, "it must be reported as unknown or ambiguous");
  assert.match(stranger.reason, /do not recognise|too alike/);
  ok("shown something she was never taught, she says she does not know it");

  // --- and when two things look alike ---
  for (let i = 0; i < 8; i++) eye.learn("red bowl", frame({ hue: 0.02, blobs: 5, size: 25, jitter: i + 50 }));
  const confusable = eye.recognise(frame({ hue: 0.01, blobs: 5, size: 25, jitter: 77 }));
  if (confusable.ambiguous) {
    assert.ok(confusable.ambiguous.length === 2);
    assert.match(confusable.reason, /too alike/);
    ok("two objects that genuinely look alike are reported as a pair, not guessed between");
  } else {
    assert.ok(["red mug", "red bowl"].includes(confusable.label));
    ok("two similar objects are still separated, and it named one of the two red things");
  }

  // --- she will not learn from a frame she cannot see ---
  const blind = eye.learn("nothing", { data: new Uint8ClampedArray(160 * 120 * 4), width: 160, height: 120 });
  assert.strictEqual(blind.learned, false);
  assert.match(blind.reason, /too dark/);
  assert.throws(() => eye.learn("", frame({})), /a label is the whole point/);
  ok("she refuses to learn from a frame she cannot see, or from an unlabelled one");

  // --- what she knows, and forgetting ---
  const known = eye.known();
  assert.strictEqual(known.length, 3);
  assert.ok(known.every((k) => k.examples > 0 && k.consistency));
  assert.strictEqual(eye.forget("red bowl"), true);
  assert.strictEqual(eye.known().length, 2);
  ok("she can list what she has been taught, and forget something on request");

  // --- it survives being closed ---
  const reopened = new Recogniser({ file: path.join(tmp, "eye.json") });
  assert.strictEqual(reopened.known().length, 2);
  assert.strictEqual(reopened.recognise(frame({ hue: 0.0, blobs: 5, size: 26, jitter: 123 })).label, "red mug");
  ok("what she has been taught survives a restart, and she still recognises it");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\neve/vision: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
