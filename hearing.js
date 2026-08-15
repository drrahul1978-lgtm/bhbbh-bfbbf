/* hearing.js — her own ears, built from scratch.
 *
 * The browser's speech recogniser does not exist inside a desktop app: WebView2
 * has no Web Speech API, and the one in Chrome uploads your audio anyway. So
 * this is the same answer her eye gives, applied to sound — she cannot
 * transcribe arbitrary speech, but she can learn the handful of things YOU say,
 * from you saying them a few times.
 *
 * Nothing here is downloaded or pretrained. The chain is:
 *
 *   samples → windowed frames → FFT → log energy in mel-spaced bands
 *           → a fixed-length fingerprint → nearest centroid
 *
 * Honest about the ceiling: this recognises *which of the phrases you taught
 * her* you just said. It does not turn speech into text, it will not know a
 * word you never recorded, and it is speaker-dependent by design — it learns
 * your voice saying your commands, which is exactly what a device in your house
 * needs and nothing more.
 */
(function (root) {
  "use strict";

  const SAMPLE_RATE = 16000;   // plenty for speech; less to chew through on a Pi
  const FRAME = 512;           // 32ms at 16kHz — long enough to resolve a vowel
  const HOP = 256;             // 50% overlap
  const BANDS = 24;            // mel-spaced energy bands per frame
  const BUCKETS = 12;          // frames collapsed into this many time slices
  const FEATURE_COUNT = BANDS * BUCKETS;

  /* Nothing quieter than this counts as speech. Without it, a silent room
   * produces a confident fingerprint of the room's hum. */
  const SILENCE_RMS = 0.012;

  // ---------------------------------------------------------------------
  // FFT — iterative radix-2 Cooley-Tukey, in place.
  // ---------------------------------------------------------------------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const angle = (-2 * Math.PI) / len;
      const wRe = Math.cos(angle), wIm = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let curRe = 1, curIm = 0;
        for (let k = 0; k < len / 2; k++) {
          const aRe = re[i + k], aIm = im[i + k];
          const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
          const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
          re[i + k] = aRe + bRe;      im[i + k] = aIm + bIm;
          re[i + k + len / 2] = aRe - bRe;  im[i + k + len / 2] = aIm - bIm;
          const nextRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = nextRe;
        }
      }
    }
  }

  /* Mel scale: human hearing resolves low frequencies far more finely than
   * high ones, so evenly-spaced bins waste most of their resolution where it
   * does not matter. */
  const toMel = (hz) => 2595 * Math.log10(1 + hz / 700);
  const fromMel = (mel) => 700 * (10 ** (mel / 2595) - 1);

  /** Which FFT bins belong to each band. Built once — it never changes. */
  const filterBank = (() => {
    const bins = FRAME / 2;
    const low = toMel(80), high = toMel(SAMPLE_RATE / 2);
    const edges = [];
    for (let i = 0; i < BANDS + 2; i++) {
      const hz = fromMel(low + ((high - low) * i) / (BANDS + 1));
      edges.push(Math.min(bins - 1, Math.round((hz / (SAMPLE_RATE / 2)) * bins)));
    }
    return edges;
  })();

  /** Hann window, so a frame's edges do not smear across the spectrum. */
  const window_ = (() => {
    const w = new Float32Array(FRAME);
    for (let i = 0; i < FRAME; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
    return w;
  })();

  /** Loudness of a signal, which is how silence is told from speech. */
  function rms(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / Math.max(1, samples.length));
  }

  /**
   * Trim leading and trailing silence.
   *
   * Without this, the same phrase said after a longer pause lands in different
   * time buckets and reads as a different phrase entirely.
   */
  function trim(samples, threshold = SILENCE_RMS) {
    const step = HOP;
    let first = 0, last = samples.length;
    for (let i = 0; i + step <= samples.length; i += step) {
      if (rms(samples.subarray(i, i + step)) > threshold) { first = i; break; }
    }
    for (let i = samples.length - step; i >= 0; i -= step) {
      if (rms(samples.subarray(i, i + step)) > threshold) { last = i + step; break; }
    }
    return last > first ? samples.subarray(first, last) : samples;
  }

  /**
   * Sound → a fixed-length fingerprint.
   *
   * Frames are collapsed into a fixed number of time buckets so that "kitchen
   * light" said quickly and said slowly produce comparable vectors. Each
   * fingerprint is normalised, so shouting and murmuring the same phrase land
   * in the same place.
   */
  function fingerprint(samples) {
    const speech = trim(samples);
    const features = new Float32Array(FEATURE_COUNT);
    const counts = new Float32Array(BUCKETS);

    const frameCount = Math.max(1, Math.floor((speech.length - FRAME) / HOP) + 1);
    const re = new Float64Array(FRAME);
    const im = new Float64Array(FRAME);

    for (let f = 0; f < frameCount; f++) {
      const offset = f * HOP;
      for (let i = 0; i < FRAME; i++) {
        re[i] = (speech[offset + i] || 0) * window_[i];
        im[i] = 0;
      }
      fft(re, im);

      const bucket = Math.min(BUCKETS - 1, Math.floor((f / frameCount) * BUCKETS));
      counts[bucket]++;
      for (let b = 0; b < BANDS; b++) {
        let energy = 0;
        for (let bin = filterBank[b]; bin <= filterBank[b + 2]; bin++) {
          energy += re[bin] * re[bin] + im[bin] * im[bin];
        }
        // Log, because loudness is perceived multiplicatively rather than linearly.
        features[bucket * BANDS + b] += Math.log(1 + energy);
      }
    }

    for (let bucket = 0; bucket < BUCKETS; bucket++) {
      const n = counts[bucket] || 1;
      for (let b = 0; b < BANDS; b++) features[bucket * BANDS + b] /= n;
    }

    let norm = 0;
    for (let i = 0; i < FEATURE_COUNT; i++) norm += features[i] * features[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < FEATURE_COUNT; i++) features[i] /= norm;
    return features;
  }

  const distance = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
    return Math.sqrt(sum);
  };

  /* How far a recording may sit from the nearest phrase and still count as it.
   * Both tests must pass, exactly as in her eye: close in absolute terms, and
   * close relative to how tightly that phrase's own examples cluster. */
  const UNKNOWN_DISTANCE = 0.62;
  const UNKNOWN_RELATIVE = 2.5;

  /**
   * The phrases she has been taught, and matching a new recording to them.
   *
   * Same shape as her eye's recogniser, and for the same reason: with five or
   * six examples a nearest-centroid comparison beats a network and — far more
   * importantly — degrades honestly. The distance to the nearest phrase is a
   * real measure of how sure she can be.
   */
  class Hearing {
    constructor(phrases = {}) {
      this.phrases = {};                 // name → { centroid, spread, examples }
      for (const [name, saved] of Object.entries(phrases)) {
        this.phrases[name] = {
          centroid: Float32Array.from(saved.centroid),
          spread: saved.spread,
          examples: saved.examples,
        };
      }
    }

    /** Teach her one more example of a phrase. */
    learn(name, samples) {
      const f = fingerprint(samples);
      const existing = this.phrases[name];
      if (!existing) {
        this.phrases[name] = { centroid: f, spread: 0, examples: 1, _all: [f] };
        return this.phrases[name];
      }
      const all = existing._all || [existing.centroid];
      all.push(f);
      const centroid = new Float32Array(FEATURE_COUNT);
      for (const example of all) for (let i = 0; i < FEATURE_COUNT; i++) centroid[i] += example[i] / all.length;
      // Spread is how far her own examples sit from their average — the yardstick
      // that decides whether a new recording is "as close as her examples are".
      let spread = 0;
      for (const example of all) spread += distance(example, centroid);
      spread /= all.length;

      this.phrases[name] = { centroid, spread, examples: all.length, _all: all };
      return this.phrases[name];
    }

    /** What did she just hear? */
    recognise(samples) {
      if (rms(samples) < SILENCE_RMS) {
        return { phrase: null, why: "I did not hear anything.", confidence: 0 };
      }
      const names = Object.keys(this.phrases);
      if (!names.length) {
        return { phrase: null, why: "You have not taught me any phrases yet.", confidence: 0 };
      }

      const f = fingerprint(samples);
      let best = null;
      for (const name of names) {
        const p = this.phrases[name];
        const d = distance(f, p.centroid);
        const relative = p.spread > 0 ? d / p.spread : d / UNKNOWN_DISTANCE;
        if (!best || d < best.distance) best = { name, distance: d, relative };
      }

      if (best.distance > UNKNOWN_DISTANCE || best.relative > UNKNOWN_RELATIVE) {
        return {
          phrase: null,
          why: "That did not sound like anything you taught me.",
          confidence: 0,
          nearest: best.name,
          distance: best.distance,
        };
      }

      return {
        phrase: best.name,
        confidence: Math.max(0.35, Math.min(0.97, 1 - best.relative / 3)),
        distance: best.distance,
      };
    }

    /** Plain data, for saving. Float32Array does not survive JSON on its own. */
    toJSON() {
      const out = {};
      for (const [name, p] of Object.entries(this.phrases)) {
        out[name] = { centroid: Array.from(p.centroid), spread: p.spread, examples: p.examples };
      }
      return out;
    }

    get names() { return Object.keys(this.phrases); }
  }

  /**
   * Resample whatever the microphone gave us to the rate the features assume.
   *
   * Browsers hand over 44100 or 48000 depending on the machine, and a
   * fingerprint taken at one rate cannot be compared with one taken at another.
   */
  function resample(samples, fromRate, toRate = SAMPLE_RATE) {
    if (fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const out = new Float32Array(Math.floor(samples.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const at = i * ratio;
      const low = Math.floor(at);
      const high = Math.min(samples.length - 1, low + 1);
      out[i] = samples[low] + (samples[high] - samples[low]) * (at - low);
    }
    return out;
  }

  const Hear = {
    SAMPLE_RATE, FRAME, HOP, BANDS, BUCKETS, FEATURE_COUNT, SILENCE_RMS,
    UNKNOWN_DISTANCE, UNKNOWN_RELATIVE,
    fft, fingerprint, rms, trim, distance, resample, Hearing,
  };

  root.Hear = Hear;
  if (typeof module !== "undefined" && module.exports) module.exports = Hear;
})(typeof self !== "undefined" ? self : globalThis);
