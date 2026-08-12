/* eve.js — Eve herself: the model, her memory, and the loop that keeps her improving.
 *
 * Eve is a neural network (nn.js) that reads cards through vision.js and learns
 * from cards drawn by synth.js. She runs in the browser and on a Raspberry Pi
 * alike, and never talks to a server — her weights live in localStorage or in a
 * JSON file on disk.
 *
 * "Keeps improving" is meant literally and measurably: the card generator can
 * produce endless fresh examples, so every training round uses cards Eve has
 * never seen. Each round is scored against a validation set she is never
 * trained on, and the new weights are kept only if that score improves —
 * otherwise they are rolled back. Progress is monotonic by construction. */
(function (root) {
  "use strict";

  const NN = root.NN || (typeof require !== "undefined" ? require("./nn.js") : null);
  const Vision = root.Vision || (typeof require !== "undefined" ? require("./vision.js") : null);
  const Synth = root.Synth || (typeof require !== "undefined" ? require("./synth.js") : null);

  const KEYS = ["centering", "corners", "edges", "surface"];
  const HIDDEN = [64, 32]; // small enough for a Pi to run instantly, big enough to learn

  const STORAGE = {
    model: "eve_model",
    corrections: "eve_corrections",
    stats: "eve_stats",
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** Grades (1–10) → network targets (0–1). */
  const gradesToTarget = (g) => Float32Array.from(KEYS.map((k) => clamp((g[k] - 1) / 9, 0, 1)));
  /** Network outputs (0–1) → grades (1–10). */
  const outputToGrades = (out) => {
    const g = {};
    KEYS.forEach((k, i) => { g[k] = clamp(out[i] * 9 + 1, 1, 10); });
    return g;
  };

  function newNet(seed = 20250811) {
    return new NN.Net([Vision.FEATURE_COUNT, ...HIDDEN, KEYS.length], { seed });
  }

  /** Mean absolute error in grade points over rows of {x, grades}. */
  function meanAbsoluteError(net, rows) {
    if (!rows.length) return 0;
    let total = 0;
    for (const row of rows) {
      const g = outputToGrades(net.predict(row.x));
      for (const k of KEYS) total += Math.abs(g[k] - row.grades[k]);
    }
    return total / (rows.length * KEYS.length);
  }

  /** Same, broken down per category. */
  function perKeyError(net, rows) {
    const totals = KEYS.map(() => 0);
    for (const row of rows) {
      const g = outputToGrades(net.predict(row.x));
      KEYS.forEach((k, i) => { totals[i] += Math.abs(g[k] - row.grades[k]); });
    }
    return totals.map((t) => (rows.length ? t / rows.length : 0));
  }

  /**
   * Grade one image end to end. Returns subgrades, an overall grade weighted the
   * way graders weight one (the worst category dominates), and notes explaining
   * what Eve actually measured — she can point at the evidence, which is the one
   * advantage a small transparent model has over a big opaque one.
   */
  function grade(net, image) {
    const { features, diagnostics } = Vision.extract(image);
    const grades = outputToGrades(net.predict(features));
    const overall = Synth.overallGrade(grades);
    return {
      ...grades,
      overall,
      label: Synth.gradeLabel(overall),
      observations: observations(grades, diagnostics),
      diagnostics,
      features,
    };
  }

  const SIDES = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const EDGE_NAMES = ["top", "bottom", "left", "right"];

  /** Turn the measurements into plain-language notes. */
  function observations(grades, d) {
    const notes = [];
    const skewH = Math.abs(d.horizontalSkew);
    const skewV = Math.abs(d.verticalSkew);
    if (skewH > 0.12 || skewV > 0.12) {
      const which = skewH > skewV
        ? `${d.horizontalSkew > 0 ? "left" : "right"} border is wider`
        : `${d.verticalSkew > 0 ? "top" : "bottom"} border is wider`;
      notes.push(`Off-centre: ${which} (${Math.round(Math.max(skewH, skewV) * 100)}% difference).`);
    } else {
      notes.push("Borders look even on all four sides.");
    }

    const worstCorner = d.cornerEnergy.indexOf(Math.max(...d.cornerEnergy));
    if (grades.corners < 8) {
      notes.push(`Corner wear detected, heaviest at the ${SIDES[worstCorner]} corner.`);
    } else {
      notes.push("Corners read as sharp — no obvious whitening.");
    }

    const worstEdge = d.edgeEnergy.indexOf(Math.max(...d.edgeEnergy));
    if (grades.edges < 8) notes.push(`Roughness along the ${EDGE_NAMES[worstEdge]} edge.`);
    if (grades.surface < 8) notes.push("Surface texture suggests scratches, print lines or a crease.");
    if (d.glare > 0.06) notes.push("Bright glare on the surface — retake in softer light for a better read.");
    if (d.box.fallback) notes.push("Could not find the card's outline; grades are less reliable.");
    return notes;
  }

  // ---------------------------------------------------------------------------
  // Persistence (browser)
  // ---------------------------------------------------------------------------

  const storageAvailable = () => {
    try { return typeof localStorage !== "undefined"; } catch { return false; }
  };

  function saveModel(net, stats) {
    if (!storageAvailable()) return false;
    try {
      localStorage.setItem(STORAGE.model, JSON.stringify(net.toJSON()));
      localStorage.setItem(STORAGE.stats, JSON.stringify(stats));
      return true;
    } catch {
      return false; // quota — training still works, it just will not persist
    }
  }

  function loadModel() {
    if (!storageAvailable()) return null;
    try {
      const raw = localStorage.getItem(STORAGE.model);
      if (!raw) return null;
      const net = NN.Net.fromJSON(JSON.parse(raw));
      if (net.sizes[0] !== Vision.FEATURE_COUNT) return null; // features changed
      const stats = JSON.parse(localStorage.getItem(STORAGE.stats) || "{}");
      return { net, stats };
    } catch {
      return null;
    }
  }

  function loadStats() {
    if (!storageAvailable()) return {};
    try { return JSON.parse(localStorage.getItem(STORAGE.stats) || "{}"); } catch { return {}; }
  }

  /** Cards the owner graded by hand — the only route to learning real photos. */
  function loadCorrections() {
    if (!storageAvailable()) return [];
    try { return JSON.parse(localStorage.getItem(STORAGE.corrections) || "[]"); } catch { return []; }
  }

  function saveCorrection(entry) {
    const all = loadCorrections();
    all.push(entry);
    // Features are ~200 floats each; keep the most recent to stay inside quota.
    const trimmed = all.slice(-200);
    try {
      localStorage.setItem(STORAGE.corrections, JSON.stringify(trimmed));
    } catch {
      localStorage.setItem(STORAGE.corrections, JSON.stringify(trimmed.slice(-50)));
    }
    return trimmed.length;
  }

  const correctionsToRows = (list) =>
    list.map((c) => ({ x: Float32Array.from(c.features), y: gradesToTarget(c.grades), grades: c.grades }));

  // ---------------------------------------------------------------------------
  // The improvement loop
  // ---------------------------------------------------------------------------

  /**
   * Runs training in small slices so the page (or a Pi's browser) stays
   * responsive, and reports after every round. Each round: draw fresh cards,
   * train, score against the held-out validation set, keep the weights only if
   * the score improved.
   */
  class Trainer {
    constructor(opts = {}) {
      this.net = opts.net || newNet();
      this.cardsPerRound = opts.cardsPerRound || 150;
      this.epochsPerRound = opts.epochsPerRound || 25;
      this.lr = opts.lr ?? 0.006;
      this.batchSize = opts.batchSize || 24;
      this.validationSize = opts.validationSize || 200;
      this.onProgress = opts.onProgress || (() => {});
      this.onRound = opts.onRound || (() => {});

      const saved = opts.stats || {};
      this.stats = {
        generation: saved.generation || 0,
        cardsSeen: saved.cardsSeen || 0,
        bestMAE: saved.bestMAE ?? null,
        history: saved.history || [],
        perKey: saved.perKey || null,
      };
      this.validation = null;
      this.running = false;
      // A rolling window of recent cards. A single small round is too little
      // data to out-argue a well-trained model, so each round trains on the
      // last few rounds' worth — fresh cards keep flowing in and old ones drop
      // out, so there is still no fixed set to memorise.
      this.poolSize = opts.poolSize || (opts.cardsPerRound || 150) * 6;
      this.pool = [];
      this.seed = (Date.now() ^ 0x5eed) >>> 0;
    }

    /** The validation cards are fixed for the session so scores are comparable. */
    ensureValidation() {
      if (this.validation) return;
      const rand = NN.mulberry32(424242); // same set the CLI trainer uses
      this.validation = [];
      for (let i = 0; i < this.validationSize; i++) {
        const card = Synth.generateCard(rand, { severity: i / Math.max(1, this.validationSize - 1) });
        this.validation.push({ x: Vision.extract(card.image).features, grades: card.grades });
      }
      // Always re-score the current weights against *this* exam. A best carried
      // in from a file was measured on a different-sized set, and comparing
      // against it would be meaningless.
      this.stats.bestMAE = meanAbsoluteError(this.net, this.validation);
    }

    /**
     * A polished Eve needs gentler nudges than a beginner: a big step that helps
     * a random network will wreck one that already scores well, and every round
     * would be rolled back. So the step size follows how good she already is.
     */
    effectiveLR() {
      const best = this.stats.bestMAE;
      if (best == null) return this.lr;
      // Squared, so the steps shrink sharply as she approaches her ceiling —
      // near the plateau only small, careful nudges ever beat the record.
      const ratio = Math.min(1, Math.max(0.08, best / 2.5));
      return this.lr * ratio * ratio;
    }

    nextSeed() {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
      return this.seed;
    }

    /** One round, yielding to the browser between slices. */
    async runRound(shouldStop = () => false) {
      this.ensureValidation();
      const rand = NN.mulberry32(this.nextSeed());

      // 1. Draw fresh cards — Eve has never seen any of these.
      const rows = [];
      for (let i = 0; i < this.cardsPerRound; i++) {
        if (shouldStop()) return null;
        const card = Synth.generateCard(rand, { severity: i / Math.max(1, this.cardsPerRound - 1) });
        rows.push({ x: Vision.extract(card.image).features, y: gradesToTarget(card.grades), grades: card.grades });
        if (i % 10 === 0) {
          this.onProgress({ phase: "drawing", done: i, total: this.cardsPerRound });
          await yieldToUI();
        }
      }

      // 2. Add them to the rolling window, and mix in real cards the owner
      //    graded — those are rarer and more valuable, so they are repeated.
      this.pool = this.pool.concat(rows).slice(-this.poolSize);
      const corrections = correctionsToRows(loadCorrections());
      const all = this.pool.concat(...Array(corrections.length ? 4 : 0).fill(corrections));

      // 3. Train, keeping a snapshot so a bad round can be undone.
      const snapshot = this.net.toJSON();
      const xs = all.map((r) => r.x);
      const ys = all.map((r) => r.y);
      const lr = this.effectiveLR();
      let loss = 0;
      for (let e = 1; e <= this.epochsPerRound; e++) {
        if (shouldStop()) break;
        loss = this.net.trainEpoch(xs, ys, { lr, batchSize: this.batchSize, rand });
        this.onProgress({ phase: "training", done: e, total: this.epochsPerRound, loss });
        await yieldToUI();
      }

      // 4. Score, then keep or roll back.
      const mae = meanAbsoluteError(this.net, this.validation);
      const improved = this.stats.bestMAE == null || mae < this.stats.bestMAE;
      this.stats.generation++;
      this.stats.cardsSeen += rows.length;

      if (improved) {
        this.stats.bestMAE = mae;
        this.stats.perKey = perKeyError(this.net, this.validation);
        saveModel(this.net, this.stats);
      } else {
        const restored = NN.Net.fromJSON(snapshot);
        this.net.layers.forEach((l, i) => {
          l.W.set(restored.layers[i].W);
          l.b.set(restored.layers[i].b);
        });
      }

      // Record her best-so-far every round, not just on the rounds that won, so
      // the progress chart shows a continuous history — flat where a round was
      // rolled back, stepping down where she genuinely got better.
      this.stats.history.push({
        generation: this.stats.generation,
        mae: this.stats.bestMAE,
        roundMAE: mae,
        improved,
        cardsSeen: this.stats.cardsSeen,
      });
      if (this.stats.history.length > 300) this.stats.history = this.stats.history.slice(-300);
      if (!improved) saveModel(this.net, this.stats); // keep the history even so

      const result ={ mae, improved, loss, generation: this.stats.generation, cardsSeen: this.stats.cardsSeen, corrections: corrections.length };
      this.onRound(result);
      return result;
    }

    /** Keep going until stopped. */
    async runForever(shouldStop) {
      this.running = true;
      while (!shouldStop()) {
        await this.runRound(shouldStop);
        await yieldToUI();
      }
      this.running = false;
    }
  }

  /** Hand control back to the browser so the page never freezes — matters most
   *  on slow hardware like a Pi, where a round takes real time. */
  function yieldToUI() {
    if (typeof requestAnimationFrame === "function") {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  const Eve = {
    KEYS, HIDDEN, STORAGE,
    newNet, grade, observations,
    gradesToTarget, outputToGrades,
    meanAbsoluteError, perKeyError,
    saveModel, loadModel, loadStats,
    loadCorrections, saveCorrection, correctionsToRows,
    Trainer, yieldToUI,
  };
  root.Eve = Eve;
  if (typeof module !== "undefined" && module.exports) module.exports = Eve;
})(typeof self !== "undefined" ? self : globalThis);
