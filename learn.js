/* learn.js — how Eve gets better at understanding you.
 *
 * Her improvement used to be measured on trading cards, which was never
 * anything to do with what she is. This measures the thing that actually
 * decides whether she is useful: does she work out what you meant?
 *
 * The rule is unchanged and is the whole point — a round is kept only if it
 * scores better on phrasings she was never trained on. Otherwise the weights
 * are thrown away and the previous generation stands. She cannot drift upward
 * by luck, and a rejected round is the mechanism working rather than failing.
 *
 * Two things make the score honest:
 *
 *   1. THE SPLIT IS BY TEMPLATE, NOT BY ROW. Every phrasing is generated from
 *      a template, so splitting rows at random puts "turn on the {thing}" in
 *      both halves with different device names — and then the test measures
 *      memorisation and reports ~100%. Holding out whole templates means she
 *      is tested on sentence shapes she has genuinely never seen.
 *
 *   2. YOUR CORRECTIONS ARE NEVER IN THE TEST SET. They are training data,
 *      weighted heavily, and scoring against them would be marking her own
 *      homework. They are counted separately so you can see both numbers.
 */
(function (root) {
  "use strict";

  const NN = root.NN || (typeof require !== "undefined" ? require("./nn.js") : null);
  const Intent = root.Intent || (typeof require !== "undefined" ? require("./intent.js") : null);

  const STORAGE = {
    net: "eve.intent.net",
    stats: "eve.intent.stats",
    corrections: "eve.intent.corrections",
  };

  /* Repeats of a correction per round. Four, matching what her card training
   * used: enough that your phrasing genuinely moves the weights, not so much
   * that one correction drowns out everything she already knew. */
  const CORRECTION_WEIGHT = 4;

  /* The held-out split is FIXED for the life of a model, and this is the seed
   * that fixes it. Two reasons, both learned by getting it wrong first:
   *
   *   - A fresh split each round scores every round against a different exam.
   *     Round 5 beating round 1 then means nothing, and "keep only if it
   *     improved" silently becomes "keep whichever round drew an easier set".
   *
   *   - A model trained on every template scores ~100% on any split, because
   *     the held-out shapes are ones it was trained on. That number is
   *     memorisation wearing a rosette.
   *
   * So: these shapes are never trained on by anyone, ever. She learns from the
   * other three quarters. It costs her a little training data and buys a score
   * that means what it says. */
  const HOLDOUT_SEED = 20250811;
  const HOLDOUT_FRACTION = 0.25;

  let heldOutCache = null;

  /**
   * Split her templates into a training half and a held-out half.
   *
   * Every intent contributes to both sides — holding out an entire intent
   * would test whether she can classify something she was never taught, which
   * is a different (and unanswerable) question.
   */
  function splitTemplates(seed = HOLDOUT_SEED, holdout = HOLDOUT_FRACTION) {
    const rand = NN.mulberry32(seed);
    const train = {};
    const validate = {};

    for (const name of Intent.INTENT_NAMES) {
      const templates = Intent.INTENTS[name].slice();
      // Shuffle so the held-out shapes differ between rounds.
      for (let i = templates.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [templates[i], templates[j]] = [templates[j], templates[i]];
      }
      // At least one held out, and at least one kept, however few there are.
      const keep = Math.max(1, Math.min(templates.length - 1, Math.round(templates.length * (1 - holdout))));
      train[name] = templates.slice(0, keep);
      validate[name] = templates.slice(keep);
    }
    return { train, validate };
  }

  /** Fill templates with devices and numbers, and featurise into rows. */
  function expand(templates, seed) {
    const rand = NN.mulberry32(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const rows = [];

    Intent.INTENT_NAMES.forEach((name, index) => {
      for (const template of templates[name] || []) {
        const repeats = template.includes("{thing}") ? 8 : 3;
        for (let r = 0; r < repeats; r++) {
          const text = template
            .replace(/\{thing\}/g, () => pick(Intent.SAMPLE_THINGS))
            .replace(/\{number\}/g, () => String(Math.floor(rand() * 100)));
          rows.push(makeRow(text, name, index));
        }
      }
    });
    return rows;
  }

  function makeRow(text, intent, index) {
    const y = new Float32Array(Intent.INTENT_NAMES.length);
    y[index >= 0 ? index : Intent.INTENT_NAMES.indexOf(intent)] = 1;
    return { x: Intent.featurise(text), y, text, intent };
  }

  /** Turn saved corrections into training rows, repeated so they carry weight. */
  function correctionRows(corrections) {
    const rows = [];
    for (const c of corrections || []) {
      const index = Intent.INTENT_NAMES.indexOf(c.intent);
      if (index < 0) continue;              // an intent that no longer exists
      for (let i = 0; i < CORRECTION_WEIGHT; i++) rows.push(makeRow(c.text, c.intent, index));
    }
    return rows;
  }

  /** Share of rows whose top-scoring intent is the right one. */
  function accuracy(net, rows) {
    if (!rows.length) return null;
    let right = 0;
    for (const row of rows) {
      const out = net.predict(row.x);
      let best = 0;
      for (let i = 1; i < out.length; i++) if (out[i] > out[best]) best = i;
      if (row.y[best] === 1) right++;
    }
    return right / rows.length;
  }

  /**
   * Her training loop.
   *
   * Each round trains a *copy* of her current weights on a fresh split, then
   * scores that copy on held-out phrasings. The copy replaces her only if it
   * scored better. `keptRounds` and `rejectedRounds` are both reported,
   * because a run that never rejects anything is a run whose test is too easy.
   */
  class Trainer {
    constructor(net, stats = {}, corrections = []) {
      this.net = net;
      this.corrections = corrections;
      this.generation = stats.generation || 0;
      this.best = typeof stats.accuracy === "number" ? stats.accuracy : null;
      this.keptRounds = stats.keptRounds || 0;
      this.rejectedRounds = stats.rejectedRounds || 0;
      this.history = stats.history || [];
    }

    /** One round. Returns what happened, including when nothing did. */
    round(opts = {}) {
      const seed = opts.seed ?? ((Math.random() * 1e9) >>> 0);
      const epochs = opts.epochs ?? 25;
      const lr = opts.lr ?? 0.03;

      /* The exam is fixed; only the practice changes. Each round fills the
       * training templates with different devices and numbers, so she sees
       * genuinely new sentences without the test moving under her. */
      const { train } = splitTemplates();
      const trainRows = expand(train, seed).concat(correctionRows(this.corrections));
      const validateRows = heldOutRows();

      // Train a copy, so a bad round cannot damage what already works.
      const candidate = NN.Net.fromJSON(this.net.toJSON());
      const rand = NN.mulberry32(seed ^ 0x5f3759df);
      const xs = trainRows.map((r) => r.x);
      const ys = trainRows.map((r) => r.y);
      for (let e = 0; e < epochs; e++) {
        candidate.trainEpoch(xs, ys, { lr, batchSize: 16, rand });
      }

      const scored = accuracy(candidate, validateRows);
      const improved = this.best === null || scored > this.best;

      this.generation++;
      if (improved) {
        this.net = candidate;
        this.best = scored;
        this.keptRounds++;
      } else {
        this.rejectedRounds++;
      }
      this.history.push({ generation: this.generation, accuracy: scored, kept: improved });
      if (this.history.length > 200) this.history = this.history.slice(-200);

      return {
        generation: this.generation,
        accuracy: scored,
        best: this.best,
        kept: improved,
        trainedOn: trainRows.length,
        testedOn: validateRows.length,
      };
    }

    /** How she does on your corrections specifically — reported, never scored on. */
    correctionAccuracy() {
      const rows = (this.corrections || [])
        .map((c) => {
          const index = Intent.INTENT_NAMES.indexOf(c.intent);
          return index < 0 ? null : makeRow(c.text, c.intent, index);
        })
        .filter(Boolean);
      return accuracy(this.net, rows);
    }

    stats() {
      return {
        generation: this.generation,
        accuracy: this.best,
        keptRounds: this.keptRounds,
        rejectedRounds: this.rejectedRounds,
        corrections: (this.corrections || []).length,
        history: this.history,
      };
    }
  }

  /** The fixed exam. Built once, then reused, so every score is comparable. */
  function heldOutRows() {
    if (!heldOutCache) {
      const { validate } = splitTemplates();
      heldOutCache = expand(validate, HOLDOUT_SEED + 1);
    }
    return heldOutCache;
  }

  /** How many sentence shapes are held back from training entirely. */
  function heldOutShapes() {
    const { validate } = splitTemplates();
    return Object.values(validate).reduce((n, list) => n + list.length, 0);
  }

  /** Score a network as it stands, without training anything. */
  function assess(net) {
    return accuracy(net, heldOutRows());
  }

  /**
   * A starting model, trained only on the three quarters she is allowed.
   *
   * This is what ships. Deliberately *not* Intent.train(), which trains on
   * every template — that model would score 100% on the held-out set for the
   * uninteresting reason that it has seen it.
   */
  function trainBaseline(opts = {}) {
    const { train } = splitTemplates();
    const rows = expand(train, opts.seed ?? 4242);
    const net = new NN.Net([Intent.DIM, 48, Intent.INTENT_NAMES.length], { seed: opts.netSeed ?? 99 });
    const rand = NN.mulberry32(7);
    const xs = rows.map((r) => r.x);
    const ys = rows.map((r) => r.y);
    const epochs = opts.epochs ?? 60;
    for (let e = 0; e < epochs; e++) net.trainEpoch(xs, ys, { lr: opts.lr ?? 0.03, batchSize: 16, rand });
    return { net, rows, accuracy: accuracy(net, heldOutRows()) };
  }

  /** A brand-new network that knows nothing — for starting her over. */
  function newNet(seed) {
    return new NN.Net([Intent.DIM, 48, Intent.INTENT_NAMES.length],
      { seed: seed ?? ((Math.random() * 1e9) >>> 0) });
  }

  // ---------------------------------------------------------------------
  // Browser-side persistence. Absent in Node, where the CLI owns the files.
  // ---------------------------------------------------------------------

  const storageAvailable = () => {
    try { return typeof localStorage !== "undefined"; } catch { return false; }
  };

  function saveNet(net, stats) {
    if (!storageAvailable()) return false;
    try {
      localStorage.setItem(STORAGE.net, JSON.stringify(Intent.toJSON(net)));
      localStorage.setItem(STORAGE.stats, JSON.stringify(stats));
      return true;
    } catch { return false; }
  }

  function loadNet() {
    if (!storageAvailable()) return null;
    try {
      const raw = localStorage.getItem(STORAGE.net);
      if (!raw) return null;
      const net = Intent.fromJSON(JSON.parse(raw));
      if (!net) return null;                 // stale format, or the intents changed
      const stats = JSON.parse(localStorage.getItem(STORAGE.stats) || "{}");
      return { net, stats };
    } catch { return null; }
  }

  function loadCorrections() {
    if (!storageAvailable()) return [];
    try { return JSON.parse(localStorage.getItem(STORAGE.corrections) || "[]"); }
    catch { return []; }
  }

  function saveCorrection(entry) {
    if (!storageAvailable()) return [];
    const all = loadCorrections();
    // One correction per phrase — teaching her the same sentence twice should
    // change her mind, not stack two contradictory rows against each other.
    const without = all.filter((c) => c.text.toLowerCase() !== entry.text.toLowerCase());
    without.push({ ...entry, at: new Date().toISOString() });
    const trimmed = without.slice(-200);
    try { localStorage.setItem(STORAGE.corrections, JSON.stringify(trimmed)); } catch { /* full */ }
    return trimmed;
  }

  function forget() {
    if (!storageAvailable()) return;
    for (const key of Object.values(STORAGE)) localStorage.removeItem(key);
  }

  /** Let the browser paint between rounds, so the page never freezes. */
  const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

  const Learn = {
    STORAGE, CORRECTION_WEIGHT, HOLDOUT_SEED, HOLDOUT_FRACTION,
    splitTemplates, expand, correctionRows, accuracy, assess, Trainer,
    heldOutRows, heldOutShapes, trainBaseline, newNet,
    saveNet, loadNet, loadCorrections, saveCorrection, forget, yieldToUI,
  };

  root.Learn = Learn;
  if (typeof module !== "undefined" && module.exports) module.exports = Learn;
})(typeof self !== "undefined" ? self : globalThis);
