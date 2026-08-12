/* recognise.js — the things you have shown her, and only those.
 *
 * She cannot name a mug she has never seen. What she can do is learn the mug
 * you showed her: hold it up, tell her what it is a handful of times, and she
 * recognises it afterwards.
 *
 * WHY NEAREST-CENTROID RATHER THAN A NETWORK
 *
 * A network needs hundreds of examples per class before it beats guessing.
 * Nobody is going to photograph their keys three hundred times. With five or
 * ten examples, comparing against the average of what you showed her is both
 * more accurate and — more importantly — it degrades honestly: the distance to
 * the nearest match is a real measure of how sure she can be, where a
 * half-trained network would return a confident-looking number that means
 * nothing.
 *
 * WHAT IT WILL AND WILL NOT MANAGE
 *
 * Things that differ in colour, texture or shape, in roughly the lighting she
 * learned them in: reliable. A red mug against a blue book, keys against a
 * phone.
 *
 * Two objects of similar colour and shape: it will confuse them, and it will
 * say so rather than guess.
 *
 * Anything she was never taught: reported as unknown. Always. A recogniser that
 * names its closest guess for an object it has never seen is worse than useless
 * — it is confidently wrong, which is the failure mode that erodes trust in
 * everything else she says.
 */
(function (root) {
"use strict";

const scene = root.Scene || (typeof require !== "undefined" ? require("./scene.js") : null);
// On a Pi she keeps what she has learned in a file; in a browser, in the page's
// own storage. Neither is required — without either she still recognises, she
// just forgets when she is closed.
const storage = typeof require !== "undefined" ? require("../kernel/storage.js") : null;

/* Beyond this distance nothing is a match. Set from the spread of examples
 * within a class: if a frame is further from every class than that class's own
 * examples typically are from each other, it is not that thing. */
const UNKNOWN_DISTANCE = 0.55;
/* And if two classes are nearly equally close, she is choosing between them by
 * noise. Better to say which two. */
const AMBIGUOUS_MARGIN = 0.12;

const distance = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
};

class Recogniser {
  constructor({ file = null, log = null } = {}) {
    this.file = file;
    this.log = log;
    this.classes = new Map();     // label → { label, examples: [Float32Array], centroid, spread }

    const loaded = this._read();
    if (loaded) {
      for (const entry of loaded) {
        this.classes.set(entry.label, {
          label: entry.label,
          examples: entry.examples.map((e) => Float32Array.from(e)),
          centroid: Float32Array.from(entry.centroid),
          spread: entry.spread,
          taughtAt: entry.taughtAt,
        });
      }
    }
  }

  _read() {
    if (this.file && storage) return storage.readWithFallback(this.file, null).value;
    try {
      const raw = typeof localStorage !== "undefined" && localStorage.getItem("eve_eye");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** Average of the examples, and how tightly they cluster. */
  _summarise(entry) {
    const n = entry.examples.length;
    const centroid = new Float32Array(scene.FEATURE_COUNT);
    for (const example of entry.examples) {
      for (let i = 0; i < centroid.length; i++) centroid[i] += example[i] / n;
    }
    entry.centroid = centroid;
    // How far a typical example sits from the middle — her own margin of error
    // for this object, which is what makes "unknown" meaningful.
    entry.spread = n > 1
      ? entry.examples.reduce((a, e) => a + distance(e, centroid), 0) / n
      : UNKNOWN_DISTANCE / 2;
    return entry;
  }

  /**
   * Teach her one view of something.
   *
   * More views in different positions beat more views of the same pose — she is
   * learning what varies and what does not.
   */
  learn(label, image) {
    if (!label) throw new Error("Tell me what this is — a label is the whole point.");
    const described = scene.describe(image);
    const check = scene.report(described);
    if (!check.usable) {
      return { learned: false, reason: check.notes[0] || "I cannot see well enough to learn from this." };
    }

    const entry = this.classes.get(label) || { label, examples: [], taughtAt: new Date().toISOString() };
    entry.examples.push(described.features);
    if (entry.examples.length > 40) entry.examples.shift();   // bounded, for a Pi
    this._summarise(entry);
    this.classes.set(label, entry);
    this._save();

    this.log?.event("vision_learned", { label, examples: entry.examples.length });
    return {
      learned: true,
      label,
      examples: entry.examples.length,
      advice: entry.examples.length < 5
        ? `Show me ${5 - entry.examples.length} more, from different angles.`
        : "That is enough to recognise it — more views from different angles will still help.",
    };
  }

  /**
   * What is this?
   *
   * Returns the label only when the match is close enough and clearly better
   * than the runner-up. Otherwise it says unknown, or names the two it cannot
   * separate.
   */
  recognise(image) {
    const described = scene.describe(image);
    const check = scene.report(described);
    if (!check.usable) {
      return { label: null, confidence: 0, reason: check.notes[0], scene: described };
    }
    if (!this.classes.size) {
      return { label: null, confidence: 0, reason: "You have not shown me anything yet.", scene: described };
    }

    const ranked = [...this.classes.values()]
      .map((entry) => ({
        label: entry.label,
        distance: distance(described.features, entry.centroid),
        // Distance measured in units of that object's own spread: being 0.2
        // away means something different for a consistent object than for one
        // photographed from every side.
        relative: distance(described.features, entry.centroid) / Math.max(0.05, entry.spread),
        examples: entry.examples.length,
      }))
      .sort((a, b) => a.distance - b.distance);

    const best = ranked[0];
    const runnerUp = ranked[1];

    // Unknown on either test: too far in absolute terms, or far compared with
    // how tightly that object's own examples cluster. The second matters —
    // being equally far from two things she knows means it is neither of them,
    // not that she cannot choose between them.
    if (best.distance > UNKNOWN_DISTANCE || best.relative > 2.5) {
      return {
        label: null, confidence: 0, unknown: true,
        reason: `I do not recognise that. The closest thing I know is ${best.label}, and it is not close.`,
        ranked, scene: described,
      };
    }
    // Genuinely ambiguous only when the best match is actually a good one.
    if (runnerUp && runnerUp.distance - best.distance < AMBIGUOUS_MARGIN) {
      return {
        label: null, confidence: 0.3, ambiguous: [best.label, runnerUp.label],
        reason: `That is either ${best.label} or ${runnerUp.label} — they look too alike to me from here.`,
        ranked, scene: described,
      };
    }

    // Confidence from how close it is relative to that object's own spread.
    const confidence = Math.max(0.35, Math.min(0.97, 1 - best.relative / 3));
    return {
      label: best.label,
      confidence,
      reason: `That looks like ${best.label}.`,
      ranked, scene: described,
    };
  }

  forget(label) {
    const had = this.classes.delete(label);
    if (had) this._save();
    return had;
  }

  known() {
    return [...this.classes.values()].map((e) => ({
      label: e.label, examples: e.examples.length, taughtAt: e.taughtAt,
      consistency: e.spread < 0.15 ? "consistent" : e.spread < 0.3 ? "varied" : "very varied — show me more of it",
    }));
  }

  _save() {
    const payload = [...this.classes.values()].map((e) => ({
      label: e.label,
      examples: e.examples.map((x) => Array.from(x, (v) => Math.round(v * 1000) / 1000)),
      centroid: Array.from(e.centroid, (v) => Math.round(v * 1000) / 1000),
      spread: e.spread,
      taughtAt: e.taughtAt,
    }));

    if (this.file && storage) return storage.writeJsonVersioned(this.file, payload);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem("eve_eye", JSON.stringify(payload));
    } catch { /* full storage should not stop her recognising */ }
  }
}

const Eye = { Recogniser, distance, UNKNOWN_DISTANCE, AMBIGUOUS_MARGIN };
root.Eye = Eye;
if (typeof module !== "undefined" && module.exports) module.exports = Eye;
})(typeof self !== "undefined" ? self : globalThis);
