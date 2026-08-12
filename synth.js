/* synth.js — a card factory that draws practice cards with known damage.
 *
 * A network learns nothing from an empty dataset, and nobody wants to hand-grade
 * 500 photos before seeing their AI work. So we draw cards ourselves: pick the
 * flaws first (off-centre by this much, corners worn by that much), paint them,
 * and the grade is known by construction — perfect, honest labels, thousands of
 * them, in seconds.
 *
 * Pixels are written by hand into an RGBA buffer rather than via a canvas, so the
 * same generator runs in the browser and in Node tests. */
(function (root) {
  "use strict";

  const CARD_W = 150;
  const CARD_H = 210; // 2.5 : 3.5, the standard trading-card ratio

  function makeImage(w, h) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }

  function setPx(img, x, y, r, g, b, alpha = 1) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const i = (y * img.width + x) * 4;
    const d = img.data;
    d[i] = d[i] * (1 - alpha) + r * alpha;
    d[i + 1] = d[i + 1] * (1 - alpha) + g * alpha;
    d[i + 2] = d[i + 2] * (1 - alpha) + b * alpha;
    d[i + 3] = 255;
  }

  function fillRect(img, x0, y0, w, h, [r, g, b], alpha = 1) {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) setPx(img, x, y, r, g, b, alpha);
    }
  }

  function fillDisc(img, cx, cy, radius, [r, g, b], alpha = 1) {
    const rad = Math.ceil(radius);
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        const d = Math.hypot(x, y);
        if (d <= radius) setPx(img, Math.round(cx + x), Math.round(cy + y), r, g, b, alpha * (1 - (d / radius) * 0.35));
      }
    }
  }

  function drawLine(img, x0, y0, x1, y1, color, alpha, thickness = 1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (thickness <= 1) setPx(img, Math.round(x), Math.round(y), ...color, alpha);
      else fillDisc(img, x, y, thickness / 2, color, alpha);
    }
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  /** Severity 0…1 → a 1–10 grade (0 damage = 10, total damage = 1). */
  const severityToGrade = (s) => 10 - 9 * clamp01(s);

  /**
   * Draw one card.
   *   rand: seeded PRNG (see NN.mulberry32)
   *   opts.severity: 0…1 overall difficulty knob — how beaten-up cards tend to be
   * Returns { image, grades, truth } where grades are 1–10 per category.
   */
  function generateCard(rand, opts = {}) {
    const pad = 18 + Math.floor(rand() * 14); // background margin around the card
    const img = makeImage(CARD_W + pad * 2, CARD_H + pad * 2);

    // --- background: a table top, lit unevenly ---
    const bgBase = 40 + rand() * 120;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const shade = bgBase + (x / img.width) * 18 - (y / img.height) * 12 + (rand() - 0.5) * 10;
        setPx(img, x, y, shade, shade * 0.98, shade * 0.95);
      }
    }

    const cx = pad, cy = pad;

    // --- how damaged is this particular card? ---
    const bias = opts.severity ?? rand();
    const roll = () => clamp01(Math.pow(rand(), 1.6) * (0.35 + bias * 1.15));
    const cornerWear = roll();
    const edgeWear = roll();
    const surfaceWear = roll();

    // Off-centering, in pixels, as a share of the border width.
    const borderW = 9 + rand() * 5;
    const maxShift = borderW * 0.9;
    const shiftX = (rand() * 2 - 1) * maxShift * clamp01(Math.pow(rand(), 1.3) * (0.4 + bias));
    const shiftY = (rand() * 2 - 1) * maxShift * clamp01(Math.pow(rand(), 1.3) * (0.4 + bias));

    // --- card stock (the border) ---
    const stockWhite = 215 + rand() * 40;
    const tint = rand();
    const stock = tint < 0.6
      ? [stockWhite, stockWhite, stockWhite * 0.98]           // white bordered
      : [stockWhite * 0.25, stockWhite * 0.25, stockWhite * 0.3]; // black bordered
    fillRect(img, cx, cy, CARD_W, CARD_H, stock);

    // Card stock texture, so a mint card is not perfectly flat.
    for (let y = 0; y < CARD_H; y++) {
      for (let x = 0; x < CARD_W; x++) {
        if (rand() < 0.25) setPx(img, cx + x, cy + y, stock[0], stock[1], stock[2], 0.08 + rand() * 0.06);
      }
    }

    // --- the artwork panel, shifted to create the centering error ---
    const artX = cx + borderW + shiftX;
    const artY = cy + borderW + shiftY;
    const artW = CARD_W - borderW * 2;
    const artH = CARD_H - borderW * 2 - 22; // room for a name bar underneath
    const hue = rand();
    const art = [
      60 + Math.sin(hue * 6.28) * 90 + 90,
      60 + Math.sin(hue * 6.28 + 2.1) * 90 + 70,
      60 + Math.sin(hue * 6.28 + 4.2) * 90 + 80,
    ];
    fillRect(img, artX, artY, artW, artH, art);

    // A subject blob plus a couple of shapes, so the interior has real detail.
    fillDisc(img, artX + artW / 2, artY + artH * 0.45, artW * 0.28, [art[0] * 0.55, art[1] * 0.6, art[2] * 0.5]);
    for (let i = 0; i < 3; i++) {
      const bw = artW * (0.2 + rand() * 0.5);
      fillRect(img, artX + rand() * (artW - bw), artY + artH * (0.6 + rand() * 0.3), bw, 4 + rand() * 5,
        [art[0] * 0.8, art[1] * 0.75, art[2] * 0.85], 0.85);
    }
    // Name bar under the art.
    fillRect(img, artX, artY + artH + 4, artW, 12, [stock[0] * 0.85, stock[1] * 0.85, stock[2] * 0.9]);
    for (let i = 0; i < 6; i++) {
      fillRect(img, artX + 4 + i * (artW / 7), artY + artH + 8, artW / 11, 4, [40, 40, 50], 0.8);
    }

    // --- corner wear: whitening and rounding at the four corners ---
    const cornerRadius = 3 + cornerWear * 9;
    const corners = [[cx, cy], [cx + CARD_W, cy], [cx, cy + CARD_H], [cx + CARD_W, cy + CARD_H]];
    for (const [px, py] of corners) {
      if (cornerWear < 0.04) continue;
      const hits = Math.round(6 + cornerWear * 40);
      for (let i = 0; i < hits; i++) {
        const dx = (rand() - 0.5) * cornerRadius * 2;
        const dy = (rand() - 0.5) * cornerRadius * 2;
        const x = px + (px === cx ? Math.abs(dx) : -Math.abs(dx));
        const y = py + (py === cy ? Math.abs(dy) : -Math.abs(dy));
        fillDisc(img, x, y, 0.8 + rand() * cornerWear * 2.5, [252, 250, 245], 0.35 + cornerWear * 0.5);
      }
    }

    // --- edge wear: chipping and whitening along the four sides ---
    if (edgeWear > 0.03) {
      const nicks = Math.round(edgeWear * 90);
      for (let i = 0; i < nicks; i++) {
        const side = Math.floor(rand() * 4);
        const t = 0.08 + rand() * 0.84;
        const depth = 1 + rand() * edgeWear * 5;
        let x, y;
        if (side === 0) { x = cx + CARD_W * t; y = cy + rand() * depth; }
        else if (side === 1) { x = cx + CARD_W * t; y = cy + CARD_H - rand() * depth; }
        else if (side === 2) { x = cx + rand() * depth; y = cy + CARD_H * t; }
        else { x = cx + CARD_W - rand() * depth; y = cy + CARD_H * t; }
        fillDisc(img, x, y, 0.7 + rand() * 1.8, [250, 248, 244], 0.4 + edgeWear * 0.5);
      }
    }

    // --- surface wear: scratches, print lines, a crease, glare ---
    if (surfaceWear > 0.05) {
      const scratches = Math.round(surfaceWear * 10);
      for (let i = 0; i < scratches; i++) {
        const x0 = cx + 6 + rand() * (CARD_W - 12);
        const y0 = cy + 6 + rand() * (CARD_H - 12);
        const len = 8 + rand() * 60 * surfaceWear;
        const angle = rand() * Math.PI * 2;
        drawLine(img, x0, y0, x0 + Math.cos(angle) * len, y0 + Math.sin(angle) * len,
          rand() < 0.5 ? [255, 255, 255] : [30, 30, 35], 0.25 + surfaceWear * 0.5, rand() < 0.3 ? 2 : 1);
      }
      if (surfaceWear > 0.55) {
        // A crease: a long bright line with a dark shadow beside it.
        const vertical = rand() < 0.5;
        const p = 0.2 + rand() * 0.6;
        const [ax, ay, bx, by] = vertical
          ? [cx + CARD_W * p, cy + 2, cx + CARD_W * p + (rand() - 0.5) * 10, cy + CARD_H - 2]
          : [cx + 2, cy + CARD_H * p, cx + CARD_W - 2, cy + CARD_H * p + (rand() - 0.5) * 10];
        drawLine(img, ax, ay, bx, by, [255, 255, 250], 0.5, 2);
        drawLine(img, ax + 2, ay, bx + 2, by, [20, 20, 25], 0.3, 1);
      }
    }

    // Glare from the camera flash — present on good and bad cards alike, so the
    // net has to learn that shine is not the same thing as damage.
    if (rand() < 0.45) {
      const gx = cx + rand() * CARD_W;
      const gy = cy + rand() * CARD_H;
      fillDisc(img, gx, gy, 12 + rand() * 26, [255, 255, 250], 0.12 + rand() * 0.2);
    }

    // Photo noise over everything.
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * 9;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }

    // --- the grades this card must have, straight from how it was drawn ---
    const centeringError = clamp01((Math.abs(shiftX) + Math.abs(shiftY)) / (maxShift * 1.4));
    const grades = {
      centering: severityToGrade(centeringError),
      corners: severityToGrade(cornerWear),
      edges: severityToGrade(edgeWear),
      surface: severityToGrade(surfaceWear),
    };
    grades.overall = overallGrade(grades);

    return {
      image: img,
      grades,
      truth: { shiftX, shiftY, borderW, cornerWear, edgeWear, surfaceWear, centeringError },
    };
  }

  /**
   * PSA-style weighting: the worst subgrade dominates. A card with one wrecked
   * corner is not a 9 just because everything else is clean.
   */
  function overallGrade({ centering, corners, edges, surface }) {
    const subs = [centering, corners, edges, surface];
    const worst = Math.min(...subs);
    const mean = subs.reduce((a, b) => a + b, 0) / subs.length;
    const overall = worst * 0.55 + mean * 0.45;
    return Math.round(Math.max(1, Math.min(10, overall)) * 2) / 2; // .5 steps
  }

  const GRADE_LABELS = [
    [9.75, "Gem Mint"], [9.0, "Mint"], [8.0, "Near Mint-Mint"], [7.0, "Near Mint"],
    [6.0, "Excellent"], [4.0, "Very Good"], [3.0, "Good"], [2.0, "Fair"], [0, "Poor"],
  ];
  const gradeLabel = (g) => (GRADE_LABELS.find(([min]) => g >= min) || [0, "Poor"])[1];

  /** Build a labelled dataset of `count` cards. */
  function generateDataset(count, seed, onProgress) {
    const NNlib = root.NN || (typeof require !== "undefined" ? require("./nn.js") : null);
    const rand = NNlib.mulberry32(seed);
    const out = [];
    for (let i = 0; i < count; i++) {
      // Spread difficulty evenly so the net sees mint and wrecked cards alike.
      out.push(generateCard(rand, { severity: i / Math.max(1, count - 1) }));
      if (onProgress && i % 25 === 0) onProgress(i / count);
    }
    return out;
  }

  const Synth = { generateCard, generateDataset, overallGrade, gradeLabel, severityToGrade, makeImage, CARD_W, CARD_H };
  root.Synth = Synth;
  if (typeof module !== "undefined" && module.exports) module.exports = Synth;
})(typeof self !== "undefined" ? self : globalThis);
