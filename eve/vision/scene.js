/* scene.js — what is in front of the camera, described by what can be measured.
 *
 * vision.js reads cards: it looks for a rectangle and measures its borders.
 * This is the general case — a frame arrives and the question is what is there
 * at all. No cards assumed, no objects assumed.
 *
 * WHAT IT MEASURES, AND WHY THESE
 *
 * Colour, as hue weighted by how colourful the pixel is. A grey pixel has no
 * meaningful hue, so counting it would just add noise; weighting by saturation
 * means a vivid red counts and a grey wall does not.
 *
 * Edge density across a grid. Where the detail is, which is a decent proxy for
 * where the thing is — a mug on a plain table puts its edges in one place.
 *
 * Edge direction. A keyboard is mostly horizontal lines; a plant is mostly
 * chaos. This separates objects that have similar colours.
 *
 * Brightness and contrast, which matter twice: they describe the scene, and
 * they tell you when the camera cannot see well enough to be believed.
 *
 * Motion against the previous frame. No training needed, and it answers
 * "is something there" and "is it moving" directly.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not know what a mug is. These are the measurable properties of a
 * frame; turning them into a name requires being taught which name goes with
 * which pattern — see recognise.js.
 */
(function (root) {
"use strict";

const HUE_BINS = 12;
const GRID = 4;             // 4x4 edge-density map
const ORIENTATION_BINS = 8;
const FEATURE_COUNT = HUE_BINS + 2 + GRID * GRID + ORIENTATION_BINS + 4; // 42

/** RGB → hue (0-1), saturation, value. Hue is meaningless when saturation is low. */
function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max / 255 };
}

/** Downscale to a working size — a Pi should not process a full frame per pixel. */
function toWorking(image, size = 96) {
  const { data, width, height } = image;
  const scale = Math.min(1, size / Math.max(width, height));
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));
  const out = { rgb: new Float32Array(w * h * 3), grey: new Float32Array(w * h), w, h };

  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * height) / h), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * width) / w), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * width) / w));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const p = (sy * width + sx) * 4;
          r += data[p]; g += data[p + 1]; b += data[p + 2]; n++;
        }
      }
      const i = y * w + x;
      out.rgb[i * 3] = r / n; out.rgb[i * 3 + 1] = g / n; out.rgb[i * 3 + 2] = b / n;
      out.grey[i] = (0.299 * r + 0.587 * g + 0.114 * b) / n / 255;
    }
  }
  return out;
}

/** Sobel gradients, keeping direction as well as strength. */
function gradients(grey, w, h) {
  const magnitude = new Float32Array(w * h);
  const angle = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = grey[i - w + 1] + 2 * grey[i + 1] + grey[i + w + 1]
               - grey[i - w - 1] - 2 * grey[i - 1] - grey[i + w - 1];
      const gy = grey[i + w - 1] + 2 * grey[i + w] + grey[i + w + 1]
               - grey[i - w - 1] - 2 * grey[i - w] - grey[i - w + 1];
      magnitude[i] = Math.min(1, Math.hypot(gx, gy) / 4);
      // Direction folded to 0-180°: a line is the same line either way round.
      angle[i] = ((Math.atan2(gy, gx) + Math.PI) % Math.PI) / Math.PI;
    }
  }
  return { magnitude, angle };
}

/**
 * Describe a frame.
 * `previous` is the last frame's features, if you have them — that is what
 * makes motion available.
 */
function describe(image, previous = null) {
  const { rgb, grey, w, h } = toWorking(image);
  const { magnitude, angle } = gradients(grey, w, h);
  const features = new Float32Array(FEATURE_COUNT);
  let k = 0;

  // --- colour, weighted so grey pixels do not vote on hue ---
  const hues = new Float32Array(HUE_BINS);
  let satTotal = 0, valTotal = 0, satWeight = 0;
  for (let i = 0; i < w * h; i++) {
    const { h: hue, s, v } = hsv(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    hues[Math.min(HUE_BINS - 1, Math.floor(hue * HUE_BINS))] += s;
    satTotal += s; valTotal += v; satWeight += 1;
  }
  const hueSum = hues.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < HUE_BINS; i++) features[k++] = hues[i] / hueSum;
  const saturation = satTotal / satWeight;
  const brightness = valTotal / satWeight;
  features[k++] = saturation;
  features[k++] = brightness;

  // --- where the detail is ---
  const cell = new Float32Array(GRID * GRID);
  const cellCount = new Float32Array(GRID * GRID);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(GRID - 1, Math.floor((y * GRID) / h));
    for (let x = 0; x < w; x++) {
      const gx = Math.min(GRID - 1, Math.floor((x * GRID) / w));
      cell[gy * GRID + gx] += magnitude[y * w + x];
      cellCount[gy * GRID + gx]++;
    }
  }
  let busiest = 0, busiestCell = 0;
  for (let i = 0; i < GRID * GRID; i++) {
    const density = cell[i] / (cellCount[i] || 1);
    features[k++] = Math.min(1, density * 3);
    if (density > busiest) { busiest = density; busiestCell = i; }
  }

  // --- which way the edges run ---
  const orientations = new Float32Array(ORIENTATION_BINS);
  let edgeTotal = 0;
  for (let i = 0; i < w * h; i++) {
    if (magnitude[i] < 0.08) continue;         // ignore flat areas, which have no direction
    orientations[Math.min(ORIENTATION_BINS - 1, Math.floor(angle[i] * ORIENTATION_BINS))] += magnitude[i];
    edgeTotal += magnitude[i];
  }
  for (let i = 0; i < ORIENTATION_BINS; i++) features[k++] = edgeTotal ? orientations[i] / edgeTotal : 0;

  // --- overall texture, and how much of the frame is busy ---
  let energy = 0, busyPixels = 0;
  for (let i = 0; i < w * h; i++) { energy += magnitude[i]; if (magnitude[i] > 0.15) busyPixels++; }
  const meanEnergy = energy / (w * h);
  const busyFraction = busyPixels / (w * h);

  // --- contrast, which says whether any of this can be believed ---
  let sumSq = 0;
  for (let i = 0; i < w * h; i++) sumSq += (grey[i] - brightness) ** 2;
  const contrast = Math.sqrt(sumSq / (w * h));

  features[k++] = Math.min(1, meanEnergy * 5);
  features[k++] = busyFraction;
  features[k++] = Math.min(1, contrast * 3);

  // --- motion, if there is a previous frame to compare with ---
  let motion = 0;
  if (previous?.thumbnail && previous.thumbnail.length === grey.length) {
    let diff = 0;
    for (let i = 0; i < grey.length; i++) diff += Math.abs(grey[i] - previous.thumbnail[i]);
    motion = diff / grey.length;
  }
  features[k++] = Math.min(1, motion * 10);

  return {
    features,
    thumbnail: grey,          // kept so the next frame can measure motion against it
    brightness, saturation, contrast, motion,
    busyFraction,
    busiestCell: { row: Math.floor(busiestCell / GRID), column: busiestCell % GRID },
    size: { w, h },
  };
}

/**
 * Say what can honestly be said about a frame without having been taught
 * anything — including, and especially, when the camera cannot see properly.
 */
function report(scene) {
  const notes = [];
  let usable = true;

  if (scene.brightness < 0.12) {
    notes.push("It is too dark for me to see anything reliably.");
    usable = false;
  } else if (scene.brightness > 0.92) {
    notes.push("The picture is washed out — too much light, or pointed at a lamp.");
    usable = false;
  }
  if (scene.contrast < 0.04) {
    notes.push("I am looking at something flat and featureless — a blank wall, or the lens is covered.");
    usable = false;
  }
  if (scene.motion > 0.06) notes.push("Something is moving.");
  else if (scene.motion > 0.015) notes.push("Something is moving slightly.");

  if (usable) {
    const where = ["top", "middle", "bottom"][Math.min(2, Math.floor(scene.busiestCell.row / 1.34))];
    const side = ["left", "centre", "right"][Math.min(2, Math.floor(scene.busiestCell.column / 1.34))];
    if (scene.busyFraction > 0.25) notes.push("A lot going on — this looks like a cluttered scene rather than one object.");
    else if (scene.busyFraction > 0.03) notes.push(`Most of the detail is ${where} ${side}.`);
    else notes.push("Almost nothing in view — a plain surface.");
  }

  return { usable, notes, brightness: scene.brightness, motion: scene.motion };
}

const Scene = { describe, report, toWorking, gradients, hsv, FEATURE_COUNT, HUE_BINS, GRID };
root.Scene = Scene;
if (typeof module !== "undefined" && module.exports) module.exports = Scene;
})(typeof self !== "undefined" ? self : globalThis);
