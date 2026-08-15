/* Her own ears — does the sound pipeline actually work?
 *
 * There is no microphone here, so these use synthesised sound with known
 * content. That proves the maths (the FFT, the bands, the matching) without
 * claiming anything about how she does on a real voice in a real room, which
 * is a separate question and is stated as unproven rather than implied.
 */
"use strict";

const assert = require("assert");
const Hear = require("../hearing.js");

let passed = 0;
const ok = (msg) => { console.log(`  ✔ ${msg}`); passed++; };

console.log("\n── her hearing ──");

// ---------------------------------------------------------------------------
// The FFT itself — everything else is worthless if this is wrong
// ---------------------------------------------------------------------------
{
  // A pure tone must appear as a spike in exactly one bin.
  const n = 512, rate = 16000, hz = 1000;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  Hear.fft(re, im);

  let peak = 0;
  for (let i = 1; i < n / 2; i++) {
    const mag = Math.hypot(re[i], im[i]);
    if (mag > Math.hypot(re[peak], im[peak])) peak = i;
  }
  const peakHz = (peak * rate) / n;
  assert.ok(Math.abs(peakHz - hz) < rate / n,
    `a ${hz}Hz tone should peak at ${hz}Hz, but peaked at ${peakHz.toFixed(0)}Hz`);
  ok(`the FFT puts a ${hz}Hz tone in the right bin (${peakHz.toFixed(0)}Hz)`);

  // Parseval: energy in time equals energy in frequency. This catches scaling
  // and indexing errors that a peak test happily passes.
  const re2 = new Float64Array(n), im2 = new Float64Array(n);
  for (let i = 0; i < n; i++) re2[i] = Math.sin((2 * Math.PI * 440 * i) / rate);
  let timeEnergy = 0;
  for (let i = 0; i < n; i++) timeEnergy += re2[i] * re2[i];
  Hear.fft(re2, im2);
  let freqEnergy = 0;
  for (let i = 0; i < n; i++) freqEnergy += (re2[i] * re2[i] + im2[i] * im2[i]) / n;
  assert.ok(Math.abs(timeEnergy - freqEnergy) / timeEnergy < 1e-9,
    `energy must be conserved: ${timeEnergy.toFixed(3)} in time, ${freqEnergy.toFixed(3)} in frequency`);
  ok("energy is conserved between time and frequency, so the transform is not merely peaking in the right place");
}

// ---------------------------------------------------------------------------
// Fingerprints
// ---------------------------------------------------------------------------

/** A crude voiced sound: a pitch, its harmonics, and a little noise. */
function utterance(pitch, formants, seconds = 0.8, seed = 1) {
  const rate = Hear.SAMPLE_RATE;
  const n = Math.floor(rate * seconds);
  const out = new Float32Array(n);
  let state = seed;
  const rand = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * pitch * h * t) / h;
    for (const f of formants) v += 0.6 * Math.sin(2 * Math.PI * f * t);
    // Fade in and out, so it reads as one utterance rather than a click.
    const envelope = Math.min(1, Math.min(i, n - i) / (rate * 0.05));
    out[i] = (v * 0.15 + rand() * 0.02) * envelope;
  }
  return out;
}

{
  const a = Hear.fingerprint(utterance(120, [700, 1200]));
  assert.strictEqual(a.length, Hear.FEATURE_COUNT);
  assert.ok(a.every(Number.isFinite), "every feature must be a real number");
  let norm = 0;
  for (const v of a) norm += v * v;
  assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-5, "fingerprints must be unit length");
  ok(`a sound becomes ${Hear.FEATURE_COUNT} finite numbers of unit length`);

  // The same phrase said louder must land in the same place — that is what
  // normalising is for, and shouting should not be a different command.
  const quiet = utterance(120, [700, 1200]);
  const loud = Float32Array.from(quiet, (v) => v * 4);
  assert.ok(Hear.distance(Hear.fingerprint(quiet), Hear.fingerprint(loud)) < 0.2,
    "the same sound at a different volume must fingerprint alike");
  ok("the same sound said louder fingerprints almost identically");

  // Two clearly different sounds must not.
  const different = Hear.fingerprint(utterance(210, [400, 2400]));
  assert.ok(Hear.distance(a, different) > 0.2,
    "clearly different sounds must fingerprint differently");
  ok("two different sounds land far apart");
}

// ---------------------------------------------------------------------------
// Learning and recognising
// ---------------------------------------------------------------------------
{
  const ears = new Hear.Hearing();

  // Teach her two phrases, six examples each, varied the way a person varies.
  for (let i = 0; i < 6; i++) {
    ears.learn("lights on", utterance(118 + i * 3, [700 + i * 12, 1200 - i * 10], 0.8, i + 1));
    ears.learn("lights off", utterance(205 + i * 3, [420 + i * 10, 2380 - i * 15], 0.8, i + 20));
  }

  assert.deepStrictEqual(ears.names.sort(), ["lights off", "lights on"]);
  assert.strictEqual(ears.phrases["lights on"].examples, 6);
  ok("she holds two taught phrases with six examples each");

  const heardOn = ears.recognise(utterance(121, [706, 1194], 0.8, 99));
  assert.strictEqual(heardOn.phrase, "lights on", `heard "${heardOn.phrase}" (${heardOn.why || ""})`);
  const heardOff = ears.recognise(utterance(208, [426, 2372], 0.8, 98));
  assert.strictEqual(heardOff.phrase, "lights off", `heard "${heardOff.phrase}" (${heardOff.why || ""})`);
  ok("a new recording of each taught phrase comes back as that phrase");

  // The one that matters: something she was never taught must be refused.
  const stranger = ears.recognise(utterance(400, [1800, 3600], 0.8, 77));
  assert.strictEqual(stranger.phrase, null,
    `a phrase she was never taught must be refused, not matched to "${stranger.phrase}"`);
  assert.match(stranger.why, /did not sound like/);
  ok("a phrase she was never taught is refused rather than matched to the nearest thing");

  // Silence is not a command.
  const silence = ears.recognise(new Float32Array(Hear.SAMPLE_RATE));
  assert.strictEqual(silence.phrase, null);
  assert.match(silence.why, /did not hear anything/);
  ok("silence is reported as silence, not as her best guess");

  // With nothing taught, she says so rather than throwing.
  const empty = new Hear.Hearing().recognise(utterance(120, [700, 1200]));
  assert.strictEqual(empty.phrase, null);
  assert.match(empty.why, /not taught me any/);
  ok("with nothing taught she says so, instead of failing");
}

// ---------------------------------------------------------------------------
// Saving, and the rates a real microphone actually gives you
// ---------------------------------------------------------------------------
{
  const ears = new Hear.Hearing();
  for (let i = 0; i < 4; i++) ears.learn("open the door", utterance(130 + i * 4, [650, 1100], 0.8, i + 5));

  const reloaded = new Hear.Hearing(JSON.parse(JSON.stringify(ears.toJSON())));
  assert.deepStrictEqual(reloaded.names, ears.names);
  const before = ears.recognise(utterance(133, [655, 1105], 0.8, 42));
  const after = reloaded.recognise(utterance(133, [655, 1105], 0.8, 42));
  assert.strictEqual(after.phrase, before.phrase, "a saved and reloaded ear must hear the same thing");
  ok("her ears survive being saved and reloaded");

  /* Microphones hand over 44100 or 48000 depending on the machine. A
   * fingerprint taken at one rate cannot be compared with one taken at
   * another, so everything is resampled first — and this is the test that
   * would fail if that were ever dropped. */
  const at48k = new Float32Array(48000);
  for (let i = 0; i < at48k.length; i++) at48k[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
  const down = Hear.resample(at48k, 48000, Hear.SAMPLE_RATE);
  assert.strictEqual(down.length, Hear.SAMPLE_RATE, "one second at 48kHz must become one second at 16kHz");

  const native = new Float32Array(Hear.SAMPLE_RATE);
  for (let i = 0; i < native.length; i++) native[i] = Math.sin((2 * Math.PI * 440 * i) / Hear.SAMPLE_RATE);
  assert.ok(Hear.distance(Hear.fingerprint(down), Hear.fingerprint(native)) < 0.1,
    "a resampled tone must fingerprint like the same tone recorded natively");
  ok("audio from a 48kHz microphone fingerprints the same as 16kHz — rates cannot silently split a phrase in two");
}

console.log(`\nher hearing: ${passed} checks passed`);
