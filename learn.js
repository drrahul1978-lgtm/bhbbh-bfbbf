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

  /* Ways of saying the same thing that carry no meaning of their own.
   *
   * Training on these teaches her that "could you turn on the lamp for me" is
   * the same request as "turn on the lamp" — she stops depending on the exact
   * scaffolding of a sentence. Measured worth about two points on phrasings
   * she has never seen; four copies was no better than two, so it is two. */
  const FILLERS = ["please", "could you", "can you", "hey", "i want you to", "would you"];
  const TAILS = ["now", "for me", "please", "thanks"];
  const DROPPABLE = new Set(["the", "a", "my", "please", "can", "you"]);

  function vary(text, rand) {
    const r = rand();
    if (r < 0.25) return `${FILLERS[Math.floor(rand() * FILLERS.length)]} ${text}`;
    if (r < 0.45) return `${text} ${TAILS[Math.floor(rand() * TAILS.length)]}`;
    if (r < 0.65) {
      const kept = Intent.tokenize(text).filter((w) => !(DROPPABLE.has(w) && rand() < 0.8));
      return kept.join(" ") || text;
    }
    return text;
  }

  /**
   * How hard to work, given the machine she woke up on.
   *
   * The architecture is identical in every preset on purpose: her mind file
   * stays portable, so a model trained overnight on a desktop can be copied
   * straight onto a Pi Zero and used there. What changes is how much practice
   * she gets per round — epochs, how many device names she sees per phrasing,
   * and how many reworded copies of each sentence.
   *
   * A Pi Zero doing a desktop-sized round would take minutes per generation
   * and thrash its card; a desktop doing a Pi-sized round would leave most of
   * its ability unused.
   */
  const EFFORT = {
    tiny:        { epochs: 12, fills: 4,  variations: 1, label: "a very small board" },
    constrained: { epochs: 25, fills: 8,  variations: 2, label: "a Raspberry Pi" },
    modest:      { epochs: 45, fills: 12, variations: 2, label: "an ordinary computer" },
    roomy:       { epochs: 80, fills: 20, variations: 3, label: "a fast machine" },
  };

  /**
   * Work out what this machine can take.
   *
   * Deliberately does not throw if the platform module is unavailable (it is
   * absent in the browser): an unknown machine is treated as a modest one,
   * which is the setting that is wrong by the smallest margin either way.
   */
  function effortFor(info) {
    const read = (i) => ({
      klass: i && i.class,
      cores: i && i.resources && i.resources.cores,
      memoryMb: i && i.resources && i.resources.memoryMb,
    });
    let { klass, cores, memoryMb } = read(info);

    if (!klass && typeof require !== "undefined") {
      try {
        const detect = require("./eve/platform/detect.js");
        ({ klass, cores, memoryMb } = read(detect.detect()));
      } catch { /* browser, or platform module absent */ }
    }

    /* A Pi Zero is 'constrained' like a Pi 4, but it is a single slow core
     * with half a gigabyte. Working that hard on it is how you get a machine
     * that is busy for minutes and useful to nobody. */
    if (klass === "constrained" && ((cores && cores <= 1) || (memoryMb && memoryMb < 1024))) {
      return { ...EFFORT.tiny, preset: "tiny", cores, memoryMb };
    }
    const preset = EFFORT[klass] ? klass : "modest";
    return { ...EFFORT[preset], preset, cores, memoryMb };
  }

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

  /**
   * Fill templates with devices and numbers, and featurise into rows.
   *
   * `variations` adds reworded copies of each sentence. The exam is always
   * built with variations: 0 — she is tested on the plain phrasing, so a score
   * cannot be inflated by grading her on sentences she was drilled on.
   */
  function expand(templates, seed, { fills = 8, variations = 0 } = {}) {
    const rand = NN.mulberry32(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const rows = [];

    Intent.INTENT_NAMES.forEach((name, index) => {
      for (const template of templates[name] || []) {
        const repeats = template.includes("{thing}") ? fills : Math.max(3, Math.round(fills / 2));
        for (let r = 0; r < repeats; r++) {
          const text = template
            .replace(/\{thing\}/g, () => pick(Intent.SAMPLE_THINGS))
            .replace(/\{number\}/g, () => String(Math.floor(rand() * 100)));
          rows.push(makeRow(text, name, index));
          for (let v = 0; v < variations; v++) rows.push(makeRow(vary(text, rand), name, index));
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
    constructor(net, stats = {}, corrections = [], effort = null) {
      this.net = net;
      this.corrections = corrections;
      /* Worked out once, from the machine she is on. */
      this.effort = effort || effortFor();
      this.generation = stats.generation || 0;
      this.best = typeof stats.accuracy === "number" ? stats.accuracy : null;
      this.keptRounds = stats.keptRounds || 0;
      this.rejectedRounds = stats.rejectedRounds || 0;
      this.history = stats.history || [];
    }

    /** One round. Returns what happened, including when nothing did. */
    round(opts = {}) {
      const seed = opts.seed ?? ((Math.random() * 1e9) >>> 0);
      const effort = this.effort;
      const epochs = opts.epochs ?? effort.epochs;
      const lr = opts.lr ?? 0.03;

      /* The exam is fixed; only the practice changes. Each round fills the
       * training templates with different devices and numbers, so she sees
       * genuinely new sentences without the test moving under her. */
      const { train } = splitTemplates();
      const trainRows = expand(train, seed, {
        fills: opts.fills ?? effort.fills,
        variations: opts.variations ?? effort.variations,
      }).concat(correctionRows(this.corrections));
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
        effort: effort.preset,
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
        effort: this.effort.preset,
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
      heldOutCache = expand(validate, HOLDOUT_SEED + 1, { fills: 8, variations: 0 });
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
    const effort = opts.effort || effortFor();
    const { train } = splitTemplates();
    const rows = expand(train, opts.seed ?? 4242, {
      fills: opts.fills ?? effort.fills,
      variations: opts.variations ?? effort.variations,
    });
    const net = new NN.Net([Intent.DIM, 48, Intent.INTENT_NAMES.length], { seed: opts.netSeed ?? 99 });
    const rand = NN.mulberry32(7);
    const xs = rows.map((r) => r.x);
    const ys = rows.map((r) => r.y);
    const epochs = opts.epochs ?? Math.max(60, effort.epochs);
    for (let e = 0; e < epochs; e++) net.trainEpoch(xs, ys, { lr: opts.lr ?? 0.03, batchSize: 16, rand });
    return { net, rows, accuracy: accuracy(net, heldOutRows()), effort };
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
    STORAGE, CORRECTION_WEIGHT, HOLDOUT_SEED, HOLDOUT_FRACTION, EFFORT, effortFor, vary,
    splitTemplates, expand, correctionRows, accuracy, assess, Trainer,
    heldOutRows, heldOutShapes, trainBaseline, newNet,
    saveNet, loadNet, loadCorrections, saveCorrection, forget, yieldToUI,
  };

  root.Learn = Learn;
  if (typeof module !== "undefined" && module.exports) module.exports = Learn;
})(typeof self !== "undefined" ? self : globalThis);
