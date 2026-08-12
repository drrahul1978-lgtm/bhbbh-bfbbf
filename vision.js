/* vision.js — turns a card photo into the numbers the network learns from.
 *
 * A raw photo is far too big to feed a small net directly (a 1000×1400 image is
 * 1.4M pixels), so we do what a grader's eye does: find the card, then measure a
 * handful of things that actually decide a grade.
 *
 *   • a 10×10 thumbnail          (overall layout & lighting)          100
 *   • an 8×8 edge-energy map     (where the detail and damage sit)     64
 *   • border widths on 4 sides   (centering)                            6
 *   • 4 corner patches           (whitening / fraying)                   8
 *   • 4 edge strips              (chipping)                              8
 *   • interior texture stats     (scratches, print lines, glare)         4
 *                                                                    = 190
 *
 * Works on any {data, width, height} — a canvas ImageData in the browser, or a
 * synthetic card generated in a test — so it can be exercised outside a browser. */
(function (root) {
  "use strict";

  const THUMB = 10;     // thumbnail grid fed to the net
  const GRID = 8;       // edge-energy grid
  const WORK = 64;      // the card is normalised to WORK×WORK before measuring
  const FEATURE_COUNT = THUMB * THUMB + GRID * GRID + 6 + 12 + 12 + 5; // 199

  /** RGBA bytes → luma in 0…1. */
  function toGray(img) {
    const { data, width, height } = img;
    const g = new Float32Array(width * height);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) {
      g[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
    }
    return { g, w: width, h: height };
  }

  /** Sobel gradient magnitude, same dimensions as the input (border = 0). */
  function gradient(gray) {
    const { g, w, h } = gray;
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const tl = g[i - w - 1], t = g[i - w], tr = g[i - w + 1];
        const l = g[i - 1], r = g[i + 1];
        const bl = g[i + w - 1], b = g[i + w], br = g[i + w + 1];
        const gx = tr + 2 * r + br - (tl + 2 * l + bl);
        const gy = bl + 2 * b + br - (tl + 2 * t + tr);
        out[i] = Math.min(1, Math.hypot(gx, gy) / 4);
      }
    }
    return out;
  }

  /**
   * Locate the card in the frame by projecting edge energy onto each axis and
   * keeping the span that holds the strong edges. Photos are usually the card
   * on a plain surface, so this is enough; if it looks wrong (a tiny or huge
   * box) we fall back to the whole frame.
   */
  function detectCard(gray, grad) {
    const { w, h } = gray;
    const cols = new Float32Array(w);
    const rows = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = grad[y * w + x];
        cols[x] += v;
        rows[y] += v;
      }
    }
    // Threshold against the quiet background, not against the busiest column:
    // detailed artwork produces far more edge energy than the card's outline, so
    // scaling off the maximum would crop straight through the border.
    const span = (proj, len) => {
      let max = 0, min = Infinity;
      for (const v of proj) {
        if (v > max) max = v;
        if (v < min) min = v;
      }
      if (max <= min) return [0, len - 1];
      // Deliberately low: this only has to bracket the card. analyseBorders()
      // then finds the exact outline, and it can only look *inward* — so a crop
      // that is a little too big is harmless, one that clips the card is not.
      const threshold = min + (max - min) * 0.06;
      let lo = 0, hi = len - 1;
      while (lo < len && proj[lo] < threshold) lo++;
      while (hi > lo && proj[hi] < threshold) hi--;
      return [lo, hi];
    };
    let [x0, x1] = span(cols, w);
    let [y0, y1] = span(rows, h);

    // Pad slightly so the card's own outer edge is inside the crop.
    const padX = Math.round((x1 - x0) * 0.04);
    const padY = Math.round((y1 - y0) * 0.04);
    x0 = Math.max(0, x0 - padX); x1 = Math.min(w - 1, x1 + padX);
    y0 = Math.max(0, y0 - padY); y1 = Math.min(h - 1, y1 + padY);

    const boxW = x1 - x0 + 1, boxH = y1 - y0 + 1;
    if (boxW < w * 0.25 || boxH < h * 0.25) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1, fallback: true };
    return { x0, y0, x1, y1, fallback: false };
  }

  /** Box-filter resample of a sub-rectangle down to outW×outH. */
  function resample(src, w, box, outW, outH) {
    const out = new Float32Array(outW * outH);
    const boxW = box.x1 - box.x0 + 1;
    const boxH = box.y1 - box.y0 + 1;
    for (let oy = 0; oy < outH; oy++) {
      const sy0 = box.y0 + Math.floor((oy * boxH) / outH);
      const sy1 = box.y0 + Math.max(Math.floor(((oy + 1) * boxH) / outH), Math.floor((oy * boxH) / outH) + 1);
      for (let ox = 0; ox < outW; ox++) {
        const sx0 = box.x0 + Math.floor((ox * boxW) / outW);
        const sx1 = box.x0 + Math.max(Math.floor(((ox + 1) * boxW) / outW), Math.floor((ox * boxW) / outW) + 1);
        let sum = 0, n = 0;
        for (let y = sy0; y < sy1; y++) {
          for (let x = sx0; x < sx1; x++) {
            sum += src[y * w + x];
            n++;
          }
        }
        out[oy * outW + ox] = n ? sum / n : 0;
      }
    }
    return out;
  }

  const at = (buf, size, x, y) => buf[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];

  /** Mean & standard deviation over a rectangle of the normalised card. */
  function patchStats(buf, size, x0, y0, x1, y1) {
    let sum = 0, sumSq = 0, n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const v = at(buf, size, x, y);
        sum += v;
        sumSq += v * v;
        n++;
      }
    }
    const mean = n ? sum / n : 0;
    const variance = n ? Math.max(0, sumSq / n - mean * mean) : 0;
    return { mean, std: Math.sqrt(variance) };
  }

  /**
   * Stats over a region of the card given in card-relative coordinates (0…1),
   * read at the photo's *native* resolution. Corner whitening and edge chipping
   * are a couple of pixels wide — shrink the image first and they simply vanish,
   * so every damage measurement is taken here, at full detail.
   */
  function regionStats(gray, grad, box, u0, v0, u1, v1) {
    const bw = box.x1 - box.x0 + 1;
    const bh = box.y1 - box.y0 + 1;
    const x0 = box.x0 + Math.floor(u0 * bw), x1 = box.x0 + Math.ceil(u1 * bw);
    const y0 = box.y0 + Math.floor(v0 * bh), y1 = box.y0 + Math.ceil(v1 * bh);
    let sum = 0, sumSq = 0, energy = 0, n = 0;
    for (let y = Math.max(0, y0); y < Math.min(gray.h, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(gray.w, x1); x++) {
        const v = gray.g[y * gray.w + x];
        sum += v;
        sumSq += v * v;
        energy += grad[y * gray.w + x];
        n++;
      }
    }
    if (!n) return { mean: 0, std: 0, energy: 0 };
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), energy: energy / n };
  }

  /**
   * Border width on each side: walk in from the card edge along the middle of
   * that side until the first strong gradient line — the frame around the art.
   * Uneven left/right or top/bottom widths is exactly what off-centering is.
   */
  /**
   * Walk inward from each side of the crop and read the gradient profile.
   *
   * There are two strong lines on every card: the card's outer edge against the
   * background, then the frame around the artwork. The first tells us exactly
   * where the card starts (so the crop can be tightened onto it); the gap
   * between the two is the border width — and unequal borders is precisely what
   * "off-centre" means. Measured at native resolution, so a one-pixel
   * difference still registers.
   */
  function analyseBorders(gray, grad, box) {
    const bw = box.x1 - box.x0 + 1;
    const bh = box.y1 - box.y0 + 1;
    const energyAt = (x, y) =>
      x < 0 || y < 0 || x >= gray.w || y >= gray.h ? 0 : grad[y * gray.w + x];

    const side = (limit, span, sample) => {
      const profile = new Float32Array(limit);
      for (let d = 0; d < limit; d++) {
        let energy = 0, n = 0;
        for (let t = 0.3; t < 0.7; t += 0.02) {
          energy += sample(d, t);
          n++;
        }
        profile[d] = energy / n;
      }
      // Smooth away single-pixel noise so peak-finding is stable.
      const smooth = new Float32Array(limit);
      for (let d = 0; d < limit; d++) {
        smooth[d] = (profile[Math.max(0, d - 1)] + profile[d] + profile[Math.min(limit - 1, d + 1)]) / 3;
      }
      /**
       * The *first* line that is clearly strong, not the strongest overall — a
       * busy subject deeper inside the artwork would otherwise win and the
       * border would measure far too wide.
       */
      const firstStrong = (from, to, frac) => {
        let max = 0;
        for (let d = from; d < to; d++) if (smooth[d] > max) max = smooth[d];
        if (max <= 0) return from;
        for (let d = from; d < to; d++) if (smooth[d] >= max * frac) return d;
        return from;
      };
      // Outer card edge: the first strong line coming in from the background.
      // The window is generous, so a loose crop still lands on the card.
      const edge = firstStrong(0, Math.min(limit, Math.max(3, Math.round(span * 0.25))), 0.55);
      // That edge is a few pixels wide in a real photo. Walk off its slope
      // before hunting for the frame, or its own tail gets mistaken for one.
      let d = edge + 1;
      while (d < limit - 1 && smooth[d] > smooth[edge] * 0.4) d++;
      const frame = firstStrong(Math.min(d, limit - 1), limit, 0.5);
      return { edge, width: Math.max(0, frame - edge) / span };
    };

    const limX = Math.floor(bw * 0.45);
    const limY = Math.floor(bh * 0.45);
    const left = side(limX, bw, (d, t) => energyAt(box.x0 + d, box.y0 + Math.round(t * bh)));
    const right = side(limX, bw, (d, t) => energyAt(box.x1 - d, box.y0 + Math.round(t * bh)));
    const top = side(limY, bh, (d, t) => energyAt(box.x0 + Math.round(t * bw), box.y0 + d));
    const bottom = side(limY, bh, (d, t) => energyAt(box.x0 + Math.round(t * bw), box.y1 - d));

    // Tighten the crop onto the card itself, so every later measurement is
    // relative to the card rather than to whatever the background was.
    const refined = {
      x0: box.x0 + left.edge,
      x1: box.x1 - right.edge,
      y0: box.y0 + top.edge,
      y1: box.y1 - bottom.edge,
      fallback: box.fallback,
    };
    if (refined.x1 - refined.x0 < bw * 0.5 || refined.y1 - refined.y0 < bh * 0.5) {
      return { box, widths: { left: left.width, right: right.width, top: top.width, bottom: bottom.width } };
    }
    return {
      box: refined,
      widths: { left: left.width, right: right.width, top: top.width, bottom: bottom.width },
    };
  }

  /**
   * Full pipeline: image → Float32Array(190) plus human-readable diagnostics
   * the UI can show ("what the AI is looking at").
   */
  function extract(img) {
    const gray = toGray(img);
    const grad = gradient(gray);
    const rough = detectCard(gray, grad);
    // Find the card's outer edge, then measure everything relative to the card.
    const { box, widths: b } = analyseBorders(gray, grad, rough);

    const thumb = resample(gray.g, gray.w, box, THUMB, THUMB);
    const gridEnergy = resample(grad, gray.w, box, GRID, GRID);
    const whole = regionStats(gray, grad, box, 0, 0, 1, 1);

    // Normalise brightness away so a dim photo of a mint card still reads mint,
    // and divide energies by the card's own busyness so a detailed artwork does
    // not look like damage.
    const norm = (v) => Math.max(0, Math.min(1, 0.5 + (v - whole.mean) * 1.5));
    const relEnergy = (v) => Math.min(1, v / (whole.energy + 0.02) / 3);

    const features = new Float32Array(FEATURE_COUNT);
    let k = 0;
    for (let i = 0; i < thumb.length; i++) features[k++] = norm(thumb[i]);
    for (let i = 0; i < gridEnergy.length; i++) features[k++] = Math.min(1, gridEnergy[i] * 3);

    // --- centering: uneven borders left/right and top/bottom ---
    const ratio = (a, c) => (a + c > 1e-4 ? (a - c) / (a + c) : 0);
    const horizontalSkew = ratio(b.left, b.right);
    const verticalSkew = ratio(b.top, b.bottom);
    features[k++] = Math.min(1, b.left * 8);
    features[k++] = Math.min(1, b.right * 8);
    features[k++] = Math.min(1, b.top * 8);
    features[k++] = Math.min(1, b.bottom * 8);
    features[k++] = 0.5 + horizontalSkew / 2;
    features[k++] = 0.5 + verticalSkew / 2;

    // Damage sits just inside the card's outline. Start a hair inside it so the
    // outline's own hard gradient does not drown out the small stuff.
    const IN = 0.012;

    // --- corners: whitening shows as brightness, fraying as roughness ---
    // Wear lives on the very tip of the corner, so this window starts at the
    // card's outline and stays tight — widen it and clean border dilutes the
    // damage until it stops registering.
    // Geometry chosen by measuring correlation against known damage: start just
    // inside the outline (whose own hard gradient would otherwise dominate) and
    // stay tight, since clean border dilutes the signal.
    const CIN = 0.02;
    const C = 0.10;
    const corners = [
      regionStats(gray, grad, box, CIN, CIN, C, C),
      regionStats(gray, grad, box, 1 - C, CIN, 1 - CIN, C),
      regionStats(gray, grad, box, CIN, 1 - C, C, 1 - CIN),
      regionStats(gray, grad, box, 1 - C, 1 - C, 1 - CIN, 1 - CIN),
    ];
    for (const s of corners) {
      features[k++] = norm(s.mean);
      features[k++] = Math.min(1, s.std * 4);
      features[k++] = relEnergy(s.energy);
    }

    // --- edges: strips down each side, corners excluded ---
    const E = 0.055;
    const edges = [
      regionStats(gray, grad, box, 0.12, IN, 0.88, E),
      regionStats(gray, grad, box, 0.12, 1 - E, 0.88, 1 - IN),
      regionStats(gray, grad, box, IN, 0.12, E, 0.88),
      regionStats(gray, grad, box, 1 - E, 0.12, 1 - IN, 0.88),
    ];
    for (const s of edges) {
      features[k++] = norm(s.mean);
      features[k++] = Math.min(1, s.std * 4);
      features[k++] = relEnergy(s.energy);
    }

    // --- surface: interior texture, scratches, glare, dark marks ---
    const interior = regionStats(gray, grad, box, 0.18, 0.18, 0.82, 0.82);
    const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
    let bright = 0, dark = 0, n = 0;
    for (let y = box.y0 + Math.floor(bh * 0.18); y < box.y0 + bh * 0.82; y++) {
      for (let x = box.x0 + Math.floor(bw * 0.18); x < box.x0 + bw * 0.82; x++) {
        const v = gray.g[y * gray.w + x];
        if (v > whole.mean + 0.3) bright++;
        if (v < whole.mean - 0.3) dark++;
        n++;
      }
    }
    features[k++] = Math.min(1, interior.energy * 4);
    features[k++] = Math.min(1, interior.std * 3);
    features[k++] = Math.min(1, (bright / Math.max(1, n)) * 6);
    features[k++] = Math.min(1, (dark / Math.max(1, n)) * 6);
    features[k++] = relEnergy(interior.energy);

    return {
      features,
      diagnostics: {
        box,
        borders: b,
        horizontalSkew,
        verticalSkew,
        brightness: whole.mean,
        contrast: whole.std,
        cornerEnergy: corners.map((s) => s.energy),
        edgeEnergy: edges.map((s) => s.energy),
        surfaceEnergy: interior.energy,
        glare: bright / Math.max(1, n),
      },
      thumb,
      thumbSize: THUMB,
    };
  }

  const Vision = { extract, toGray, gradient, detectCard, resample, patchStats, regionStats, analyseBorders, FEATURE_COUNT, WORK, THUMB, GRID };
  root.Vision = Vision;
  if (typeof module !== "undefined" && module.exports) module.exports = Vision;
})(typeof self !== "undefined" ? self : globalThis);
