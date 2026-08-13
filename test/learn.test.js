/* Her learning — does "she is getting better" mean anything?
 *
 * These tests exist because the previous version of this loop was wrong in two
 * ways that both produced encouraging numbers. Each is now pinned by a test
 * that fails if it comes back.
 */
"use strict";

const assert = require("assert");
const NN = require("../nn.js");
const Intent = require("../intent.js");
const Learn = require("../learn.js");

const TAIL_WORDS = ["now", "for me", "please", "thanks"];

let passed = 0;
const ok = (msg) => { console.log(`  ✔ ${msg}`); passed++; };

console.log("\n── her learning ──");

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------
{
  const { train, validate } = Learn.splitTemplates();

  for (const name of Intent.INTENT_NAMES) {
    assert.ok(train[name].length > 0, `${name} must have something to train on`);
    assert.ok(validate[name].length > 0, `${name} must have something held back`);
    const overlap = train[name].filter((t) => validate[name].includes(t));
    assert.strictEqual(overlap.length, 0, `${name}: no template may be on both sides`);
  }
  ok("every intent has templates to learn from and templates held back, and none are on both sides");

  // The bug this replaces: splitting rows rather than templates put the same
  // sentence shape on both sides with a different device name, so the score
  // measured memorisation and read ~100%.
  const trainTexts = new Set(Learn.expand(train, 1).map((r) => r.text));
  const shared = Learn.expand(validate, 1).filter((r) => trainTexts.has(r.text));
  assert.strictEqual(shared.length, 0, "no test sentence may also be a training sentence");
  ok("no sentence appears in both halves, so the exam cannot be sat with memorised answers");
}

// ---------------------------------------------------------------------------
// The exam is fixed
// ---------------------------------------------------------------------------
{
  const first = Learn.heldOutRows().map((r) => r.text).join("|");
  const again = Learn.heldOutRows().map((r) => r.text).join("|");
  assert.strictEqual(first, again, "the held-out set must not change between calls");

  const a = Learn.splitTemplates();
  const b = Learn.splitTemplates();
  assert.deepStrictEqual(a.validate, b.validate, "the split must be deterministic");
  ok("the exam is identical every time, so two rounds' scores can be compared at all");
}

// ---------------------------------------------------------------------------
// Training on everything is caught, not rewarded
// ---------------------------------------------------------------------------
{
  const cheat = Intent.train().net;               // trained on every template
  const honest = Learn.trainBaseline();           // trained on the allowed three quarters

  const cheatScore = Learn.assess(cheat);
  assert.ok(cheatScore > 0.95,
    "a model trained on the whole set should score near-perfectly — that is the trap");
  assert.ok(honest.accuracy < cheatScore,
    "the honestly-trained model must score below the one that saw the exam");
  ok(`training on the exam scores ${(cheatScore * 100).toFixed(0)}% and training honestly scores ${(honest.accuracy * 100).toFixed(0)}% — the gap is why the shipped model uses the second`);
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------
{
  const trainer = new Learn.Trainer(Learn.newNet(7), {});
  trainer.best = Learn.assess(trainer.net);

  let sawRejection = false;
  let previousBest = trainer.best;

  for (let i = 0; i < 12; i++) {
    const r = trainer.round({ seed: 500 + i });
    assert.ok(r.best >= previousBest - 1e-9, "her best score must never fall");
    if (!r.kept) {
      sawRejection = true;
      assert.strictEqual(r.best, previousBest, "a rejected round must leave her best untouched");
    }
    previousBest = r.best;
  }

  assert.ok(sawRejection, "some rounds must be rejected, or the gate is not doing anything");
  ok("her best score can only go up, and rounds that score worse are discarded");

  const s = trainer.stats();
  assert.strictEqual(s.keptRounds + s.rejectedRounds, s.generation,
    "every round must be counted as either kept or rejected");
  ok("kept and rejected rounds add up to the generations run — nothing is quietly uncounted");
}

// ---------------------------------------------------------------------------
// A rejected round changes nothing at all
// ---------------------------------------------------------------------------
{
  const trainer = new Learn.Trainer(Learn.trainBaseline().net, {});
  trainer.best = Learn.assess(trainer.net);
  /* Snapshot before *each* round rather than once at the start: a kept round
   * is supposed to change her weights, so comparing across one would fail for
   * the wrong reason. */
  let checked = 0;
  for (let i = 0; i < 20 && checked < 3; i++) {
    const before = JSON.stringify(trainer.net.toJSON());
    const r = trainer.round({ seed: 900 + i });
    const after = JSON.stringify(trainer.net.toJSON());
    if (r.kept) {
      assert.notStrictEqual(after, before, "a kept round must actually replace her weights");
    } else {
      assert.strictEqual(after, before,
        "a rejected round must leave her weights byte-for-byte unchanged");
      checked++;
    }
  }

  assert.ok(checked >= 3, "expected at least three rejected rounds in twenty");
  ok("a rejected round leaves her weights untouched, not merely her score");
}

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------
{
  const corrections = [{ text: "make the lounge lamp glow", intent: "turn_on" }];
  const rows = Learn.correctionRows(corrections);
  assert.strictEqual(rows.length, Learn.CORRECTION_WEIGHT,
    "a correction should be repeated so it carries weight");
  assert.ok(rows.every((r) => r.intent === "turn_on"));
  ok(`your correction is replayed ${Learn.CORRECTION_WEIGHT}× per round, so your phrasing actually moves her`);

  // The important one: corrections must never be scored on. Marking her own
  // homework would make every correction look like an instant improvement.
  const heldOut = new Set(Learn.heldOutRows().map((r) => r.text));
  assert.ok(!heldOut.has(corrections[0].text),
    "a correction must not appear in the set she is scored against");
  ok("corrections are training data only — she is never examined on the answers you gave her");

  const unknown = Learn.correctionRows([{ text: "hello", intent: "an_intent_that_was_removed" }]);
  assert.strictEqual(unknown.length, 0, "a correction for a removed intent must be dropped");
  ok("a correction naming an intent that no longer exists is dropped rather than crashing");
}

// ---------------------------------------------------------------------------
// She still admits when she does not know
// ---------------------------------------------------------------------------
{
  const net = Learn.trainBaseline().net;
  const result = Intent.classify(net, "photosynthesis in mangrove root systems");
  assert.strictEqual(result.intent, "unknown",
    "a sentence about nothing she handles must come back unknown");
  ok("a request nowhere near her intents is answered 'unknown' rather than guessed at");
}


// ---------------------------------------------------------------------------
// Sizing the work to the machine
// ---------------------------------------------------------------------------
{
  const machine = (klass, cores, memoryMb) => ({ class: klass, resources: { cores, memoryMb } });

  const zero = Learn.effortFor(machine("constrained", 1, 512));
  const pi4 = Learn.effortFor(machine("constrained", 4, 4096));
  const laptop = Learn.effortFor(machine("modest", 8, 16384));
  const desktop = Learn.effortFor(machine("roomy", 16, 32768));

  assert.strictEqual(zero.preset, "tiny", "a single-core half-gig board is not a Pi 4");
  assert.strictEqual(pi4.preset, "constrained");
  assert.strictEqual(desktop.preset, "roomy");

  // Each step up must actually ask for more work, or the detection is decorative.
  const work = (e) => e.epochs * e.fills * (1 + e.variations);
  assert.ok(work(zero) < work(pi4), "a Pi Zero must do less work than a Pi 4");
  assert.ok(work(pi4) < work(laptop), "a Pi 4 must do less work than an ordinary computer");
  assert.ok(work(laptop) < work(desktop), "a fast machine must do more work than an ordinary one");
  ok(`she sizes each round to the machine: ${work(zero)} units on a Pi Zero, ${work(desktop)} on a fast desktop`);

  /* The architecture must NOT change with the machine. If it did, a mind
   * trained on a desktop could not be copied onto a Pi, which is the whole
   * point of her weights being a file. */
  const small = Learn.trainBaseline({ effort: Learn.EFFORT.tiny, epochs: 5 }).net;
  const big = Learn.trainBaseline({ effort: Learn.EFFORT.roomy, epochs: 5 }).net;
  assert.deepStrictEqual(small.toJSON().sizes, big.toJSON().sizes,
    "the network shape must not depend on the machine that trained it");
  assert.ok(Intent.fromJSON(Intent.toJSON(big)), "a desktop-trained mind must load anywhere");
  ok("a mind trained on a fast machine loads unchanged on a small one — only the effort differs");

  // An unrecognised machine must still work rather than throw.
  const unknown = Learn.effortFor({ class: "something-new", resources: {} });
  assert.ok(unknown.epochs > 0, "an unfamiliar machine must still get a usable setting");
  ok("an unrecognised machine falls back to the middle setting instead of failing");
}

// ---------------------------------------------------------------------------
// Rewording, which is how she learns that filler words do not change meaning
// ---------------------------------------------------------------------------
{
  const rand = NN.mulberry32(3);
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(Learn.vary("turn on the kitchen light", rand));
  assert.ok(seen.size > 3, "rewording should produce genuinely different sentences");
  assert.ok([...seen].every((t) => t.trim().length > 0), "no rewording may produce an empty sentence");
  ok(`one sentence becomes ${seen.size} phrasings, so she learns the request rather than the wording`);

  // The exam must never contain reworded sentences — she is tested plainly.
  const plain = Learn.heldOutRows().map((r) => r.text);
  assert.ok(plain.every((t) => !TAIL_WORDS.some((w) => t.endsWith(` ${w}`))),
    "the held-out exam must be plain phrasings, not drilled variations");
  ok("the exam is plain phrasings only — rewording is practice, never the test");
}

console.log(`\nher learning: ${passed} checks passed`);
