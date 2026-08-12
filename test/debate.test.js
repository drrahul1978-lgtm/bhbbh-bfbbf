/* Eve One against Eve Two: does the right one win, and does she admit it when
 * neither should?
 * Run with:  node test/debate.test.js  */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const NN = require("../nn.js");
const Synth = require("../synth.js");
const Eve = require("../eve.js");
const Debate = require("../eve/debate/debate.js");

let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

const one = NN.Net.fromJSON(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "eve-model.json"), "utf8")).net);
const two = NN.Net.fromJSON(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "eve-model-two.json"), "utf8")).net);

(async () => {
  // --- two different methods, not two copies ---
  const card = Synth.generateCard(NN.mulberry32(11), { severity: 0.5 });
  const result = Debate.debate(one, two, card.image);

  assert.ok(result.eveOne && result.eveTwo, "both should have answered");
  const identical = Eve.KEYS.every((k) => result.eveOne[k] === result.eveTwo[k]);
  assert.ok(!identical, "two methods that always agree exactly would not be two methods");
  assert.strictEqual(result.rounds.length, 4, "one round per category");
  ok("both Eves grade the card independently and do not simply echo each other");

  // --- the transcript explains itself in measurements ---
  for (const line of result.transcript) {
    assert.ok(line.length > 20, "every round should produce a readable line");
    assert.ok(/near enough|measured|corrections|between/.test(line), `a line should say why: "${line}"`);
  }
  assert.ok(!result.transcript.join(" ").match(/\b(confident|sure|believe|think)\b/i),
    "the judge must reason from evidence, never from how sure someone sounded");
  ok("every round explains itself by what was measured, not by who sounded surer");

  // --- agreement means high confidence ---
  const agreeing = Debate.settle("corners", 8, 8.5, { measured: 1.4, decisive: false, reads: "roughness" }, null);
  assert.strictEqual(agreeing.winner, "both");
  assert.ok(agreeing.confidence > 0.8);
  assert.strictEqual(agreeing.grade, 8.25);
  assert.match(agreeing.line, /near enough/);
  ok("when they agree there is nothing to settle and confidence is high");

  // --- the step that was removed, and why ---
  // Letting the measurement pick a winner lost to plain averaging (1.463
  // against 1.357 grade points over 139 contested categories), so there is no
  // evidence-decides path any more. This asserts it did not creep back.
  const contestedRound = Debate.settle("corners", 9, 4,
    { measured: 3.6, decisive: true, reliable: true, reliability: 0.8, reads: "corner roughness" }, null);
  assert.notStrictEqual(contestedRound.basis, "evidence",
    "the measurement must not pick a winner — that was measured and it was worse");
  assert.strictEqual(contestedRound.winner, "neither");
  assert.strictEqual(contestedRound.grade, 6.5, "the answer is their average, not one side's claim");
  ok("a measurement never picks the winner — that step lost to averaging and was removed");

  // --- track record decides when the measurement does not ---
  const record = { corners: { samples: 25, oneAccuracy: 0.75, twoAccuracy: 0.25 } };
  const byRecord = Debate.settle("corners", 8, 4, { measured: 1.8, decisive: false, reads: "roughness" }, record);
  assert.strictEqual(byRecord.winner, "one");
  assert.strictEqual(byRecord.basis, "track record");
  assert.match(byRecord.line, /25 corrections/);
  ok("with middling evidence, whoever has actually been right before wins");

  // A thin record is not a record.
  const thin = Debate.settle("corners", 8, 4, { measured: 1.8, decisive: false, reads: "roughness" },
    { corners: { samples: 3, oneAccuracy: 1, twoAccuracy: 0 } });
  assert.strictEqual(thin.winner, "neither", "three corrections is not a track record");
  ok("a handful of corrections does not count as having been right before");

  // --- and when nothing settles it, nobody wins ---
  const unresolved = Debate.settle("surface", 9, 3, { measured: 0.05, decisive: false, reads: "texture" }, null);
  assert.strictEqual(unresolved.winner, "neither");
  assert.strictEqual(unresolved.unresolved, true);
  assert.deepStrictEqual(unresolved.range, [3, 9]);
  assert.ok(unresolved.confidence <= 0.3, "an unsettled category must not report confidence");
  assert.match(unresolved.line, /I am not going to pick a winner/);
  assert.strictEqual(unresolved.grade, 6, "the answer is their average, reported as uncertain");
  ok("when nothing settles it neither wins, a range is given, and it asks you");

  // --- disagreement is escalated, not buried ---
  const contested = Debate.debate(one, two, card.image);
  if (contested.needsHuman) {
    assert.ok(contested.unresolved.length > 0);
    assert.ok(contested.confidence < 0.8, "unsettled categories should drag confidence down");
    assert.ok(contested.observations.some((n) => /could not settle/.test(n)),
      "and the notes should say so out loud");
    ok("an unsettled card lowers confidence, says so in its notes and asks for a human");
  } else {
    assert.ok(contested.confidence > 0.5);
    ok("a card they settled between them reports without needing a human");
  }

  // --- confidence tracks agreement across many cards ---
  const rand = NN.mulberry32(77);
  const results = [];
  for (let i = 0; i < 60; i++) {
    const c = Synth.generateCard(rand, { severity: i / 59 });
    results.push({ result: Debate.debate(one, two, c.image), truth: c.grades });
  }
  const settled = results.filter((r) => !r.result.needsHuman);
  const contestedOnes = results.filter((r) => r.result.needsHuman);
  assert.ok(settled.length > 0 && contestedOnes.length > 0, "some cards should be easy and some hard");

  const errorOf = (r) => Eve.KEYS.reduce((a, k) => a + Math.abs(r.result[k] - r.truth[k]), 0) / 4;
  const settledError = settled.reduce((a, r) => a + errorOf(r), 0) / settled.length;
  const contestedError = contestedOnes.reduce((a, r) => a + errorOf(r), 0) / contestedOnes.length;
  console.log(`      settled cards: ${settledError.toFixed(2)} points off · contested: ${contestedError.toFixed(2)} points off`);
  assert.ok(contestedError > settledError,
    "disagreement should mark the genuinely harder cards, or it is not telling us anything");
  ok("cards they disagree on really are the harder ones — the disagreement carries information");

  // The debate must not cost accuracy for the sake of the uncertainty signal.
  const soloError = results.reduce((a, r) =>
    a + Eve.KEYS.reduce((s, k) => s + Math.abs(r.result.eveOne[k] - r.truth[k]), 0) / 4, 0) / results.length;
  const debatedError = results.reduce((a, r) => a + errorOf(r), 0) / results.length;
  console.log(`      Eve One alone: ${soloError.toFixed(2)} · after debating: ${debatedError.toFixed(2)}`);
  assert.ok(debatedError < soloError * 1.1,
    `debating must not make grading meaningfully worse: ${soloError.toFixed(2)} → ${debatedError.toFixed(2)}`);
  ok("debating costs no accuracy — it buys knowing which answers to doubt");

  // --- the record is earned from corrections, not assumed ---
  const scored = results.slice(0, 30).map((r) => Debate.scoreAgainstTruth(r.result, r.truth));
  const built = Debate.buildRecord(scored);
  for (const key of Eve.KEYS) {
    assert.ok(built[key].samples === 30);
    assert.ok(built[key].oneAccuracy + built[key].twoAccuracy <= 1.0001);
  }
  console.log(`      who was closer: ${Eve.KEYS.map((k) => `${k} one ${(built[k].oneAccuracy * 100).toFixed(0)}%`).join(", ")}`);
  ok("a track record is built from who was actually closer, once the truth is known");

  // --- no key, no network, anywhere in this path ---
  const source = fs.readFileSync(path.join(__dirname, "..", "eve", "debate", "debate.js"), "utf8");
  assert.ok(!/fetch\(|http|api[_-]?key|token/i.test(source), "the debate must not reach the network or want a credential");
  ok("the whole debate runs locally with no key, no request and no provider");

  console.log(`\neve/debate: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
