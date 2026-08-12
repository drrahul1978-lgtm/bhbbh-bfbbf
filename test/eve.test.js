/* Checks Eve herself: that she grades in the right shape, that her improvement
 * loop only ever keeps weights that score better, and that her notes describe
 * what was actually measured.  Run with:  node test/eve.test.js  */
const assert = require("assert");
const NN = require("../nn.js");
const Vision = require("../vision.js");
const Synth = require("../synth.js");
const Eve = require("../eve.js");

// Some checks train for a few rounds, so the runner awaits each in turn.
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("grades come back in range, with subgrades and notes", () => {
  const net = Eve.newNet();
  const card = Synth.generateCard(NN.mulberry32(9), { severity: 0.5 });
  const r = Eve.grade(net, card.image);

  for (const key of Eve.KEYS) {
    assert.ok(r[key] >= 1 && r[key] <= 10, `${key} out of range: ${r[key]}`);
  }
  assert.ok(r.overall >= 1 && r.overall <= 10, "overall out of range");
  assert.strictEqual(r.overall, Math.round(r.overall * 2) / 2, "overall should land on a .5 step");
  assert.ok(typeof r.label === "string" && r.label.length, "needs a PSA-style label");
  assert.ok(r.observations.length >= 2, "should explain what it measured");
  assert.strictEqual(r.features.length, Vision.FEATURE_COUNT);
});

test("the worst category drags the overall grade down", () => {
  const clean = { centering: 10, corners: 10, edges: 10, surface: 10 };
  const oneBadCorner = { centering: 10, corners: 2, edges: 10, surface: 10 };
  assert.strictEqual(Synth.overallGrade(clean), 10);
  const dragged = Synth.overallGrade(oneBadCorner);
  assert.ok(dragged < 7, `one wrecked corner must matter, got ${dragged}`);
  assert.ok(dragged > 2, `…but not sink the card to its worst subgrade alone, got ${dragged}`);
});

test("grade labels move in the right direction", () => {
  assert.strictEqual(Synth.gradeLabel(10), "Gem Mint");
  assert.strictEqual(Synth.gradeLabel(9.5), "Mint");
  assert.strictEqual(Synth.gradeLabel(1), "Poor");
});

test("targets and grades round-trip", () => {
  const grades = { centering: 8.5, corners: 3, edges: 10, surface: 1 };
  const back = Eve.outputToGrades(Eve.gradesToTarget(grades));
  for (const key of Eve.KEYS) {
    assert.ok(Math.abs(back[key] - grades[key]) < 1e-5, `${key} did not survive the round trip`);
  }
});

test("a training round only keeps weights that score better", async () => {
  const trainer = new Eve.Trainer({
    cardsPerRound: 40,
    epochsPerRound: 8,
    validationSize: 40,
  });
  const first = await trainer.runRound();
  assert.ok(first, "round should return a result");
  assert.strictEqual(trainer.stats.generation, 1);
  assert.ok(trainer.stats.cardsSeen === 40, `expected 40 cards seen, got ${trainer.stats.cardsSeen}`);

  // Whatever happens next, the recorded best can never get worse…
  const bestAfterFirst = trainer.stats.bestMAE;
  for (let i = 0; i < 3; i++) {
    await trainer.runRound();
    assert.ok(
      trainer.stats.bestMAE <= bestAfterFirst + 1e-9,
      `best error must never increase: ${bestAfterFirst} → ${trainer.stats.bestMAE}`
    );
  }
  // …and the live weights must actually match the best score, i.e. a losing
  // round was genuinely rolled back rather than left in place.
  const live = Eve.meanAbsoluteError(trainer.net, trainer.validation);
  assert.ok(
    Math.abs(live - trainer.stats.bestMAE) < 1e-6,
    `weights in memory (${live.toFixed(4)}) should be the best ones (${trainer.stats.bestMAE.toFixed(4)})`
  );
});

test("she measurably learns: error falls over several rounds", async () => {
  const trainer = new Eve.Trainer({ cardsPerRound: 150, epochsPerRound: 20, validationSize: 100 });
  trainer.ensureValidation();
  const before = Eve.meanAbsoluteError(trainer.net, trainer.validation);
  for (let i = 0; i < 4; i++) await trainer.runRound();
  const after = trainer.stats.bestMAE;
  console.log(`      ${before.toFixed(2)} → ${after.toFixed(2)} grade points`);
  assert.ok(after < before * 0.75, `expected clear learning, got ${before.toFixed(2)} → ${after.toFixed(2)}`);
});

(async () => {
  let passed = 0;
  for (const { name, fn } of tests) {
    await fn();
    passed++;
    console.log(`  \u2714 ${name}`);
  }
  console.log(`\neve.js: ${passed} tests passed`);
})().catch((err) => {
  console.error(`\n\u2716 ${err.message}`);
  process.exit(1);
});
