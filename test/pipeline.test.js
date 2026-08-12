/* End-to-end proof that the thing actually learns: draw cards with known
 * damage, extract features, train the net, then grade cards it has never seen
 * and compare against a "just guess the average" baseline.
 * Run with:  node test/pipeline.test.js  */
const assert = require("assert");
const NN = require("../nn.js");
const Vision = require("../vision.js");
const Synth = require("../synth.js");

const KEYS = ["centering", "corners", "edges", "surface"];
const toTarget = (g) => Float32Array.from(KEYS.map((k) => (g[k] - 1) / 9));
const toGrades = (out) => Array.from(out, (v) => v * 9 + 1);

console.log("Generating cards…");
const t0 = Date.now();
const cards = Synth.generateDataset(1200, 20250811);
const samples = cards.map((c) => ({
  x: Vision.extract(c.image).features,
  y: toTarget(c.grades),
  grades: c.grades,
}));
console.log(`  ${samples.length} cards drawn + featurised in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Deterministic shuffle, then an 80/20 train/test split.
const rand = NN.mulberry32(5);
for (let i = samples.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [samples[i], samples[j]] = [samples[j], samples[i]];
}
const split = Math.floor(samples.length * 0.8);
const train = samples.slice(0, split);
const test = samples.slice(split);

const net = new NN.Net([Vision.FEATURE_COUNT, 48, 24, KEYS.length], { seed: 4242 });
console.log(`Training ${net.sizes.join(" → ")} on ${train.length} cards…`);

const xs = train.map((s) => s.x);
const ys = train.map((s) => s.y);
const trainRand = NN.mulberry32(77);
const t1 = Date.now();
for (let epoch = 1; epoch <= 140; epoch++) {
  const loss = net.trainEpoch(xs, ys, { lr: 0.006, batchSize: 16, rand: trainRand });
  if (epoch % 35 === 0) console.log(`  epoch ${epoch}: train MSE ${loss.toFixed(5)}`);
}
console.log(`  trained in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

// Mean absolute error, in grade points, on cards the net never saw.
const meanGrades = KEYS.map((k) => train.reduce((a, s) => a + s.grades[k], 0) / train.length);
let netErr = 0, baseErr = 0;
const perKey = KEYS.map(() => 0);
for (const s of test) {
  const pred = toGrades(net.predict(s.x));
  KEYS.forEach((k, i) => {
    const e = Math.abs(pred[i] - s.grades[k]);
    perKey[i] += e;
    netErr += e;
    baseErr += Math.abs(meanGrades[i] - s.grades[k]);
  });
}
const n = test.length * KEYS.length;
const netMAE = netErr / n;
const baseMAE = baseErr / n;

console.log("\nHeld-out error (grade points, lower is better):");
KEYS.forEach((k, i) => console.log(`  ${k.padEnd(10)} ${(perKey[i] / test.length).toFixed(2)}`));
console.log(`  ${"ALL".padEnd(10)} ${netMAE.toFixed(2)}   (guessing the average: ${baseMAE.toFixed(2)})`);

assert.ok(netMAE < baseMAE * 0.65, `net (${netMAE.toFixed(2)}) must clearly beat the baseline (${baseMAE.toFixed(2)})`);
assert.ok(netMAE < 1.3, `expected under 1.3 grade points of error, got ${netMAE.toFixed(2)}`);

// Clean cards must outgrade beaten ones. Severity is a distribution rather than
// a single card, so this compares populations: 30 of each, against the grades
// those cards were actually drawn with.
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const population = (severity, seed) => {
  const rand = NN.mulberry32(seed);
  const predicted = [];
  const actual = [];
  for (let i = 0; i < 30; i++) {
    const card = Synth.generateCard(rand, { severity });
    predicted.push(avg(toGrades(net.predict(Vision.extract(card.image).features))));
    actual.push(avg(KEYS.map((k) => card.grades[k])));
  }
  return { predicted: avg(predicted), actual: avg(actual) };
};

const clean = population(0, 31337);
const beaten = population(1, 31337);
console.log(`\nSanity: clean cards → Eve ${clean.predicted.toFixed(1)} (truly ${clean.actual.toFixed(1)})`);
console.log(`        beaten cards → Eve ${beaten.predicted.toFixed(1)} (truly ${beaten.actual.toFixed(1)})`);

assert.ok(clean.predicted > beaten.predicted, "clean cards must outgrade beaten ones");
// She should capture most of the real gap between the two populations.
const realGap = clean.actual - beaten.actual;
const seenGap = clean.predicted - beaten.predicted;
assert.ok(
  seenGap > realGap * 0.6,
  `expected to see most of the ${realGap.toFixed(1)}-point gap, saw ${seenGap.toFixed(1)}`
);

console.log("\npipeline: all assertions passed");
