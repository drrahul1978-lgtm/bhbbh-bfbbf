/* Corrections becoming tests, and repeated mistakes becoming changes of method.
 * Run with:  node test/regression.test.js  */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { RegressionSuite, LessonBook, keyFacts } = require("../eve/learn/regression.js");
const { CaseStore, VERDICTS } = require("../eve/review/cases.js");
const { findPatterns } = require("../eve/review/evaluator.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-regression-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

(async () => {
  const store = new CaseStore({ file: path.join(tmp, "cases.json") });
  const suite = new RegressionSuite({ file: path.join(tmp, "regression.json") });

  // --- a correction becomes a test ---
  const wrong = store.open({
    question: "What port does Home Assistant use?",
    answer: "Home Assistant listens on port 8321.",
    why: "user disputed it",
  });
  store.attachEvaluation(wrong.id, { available: true, correct: false, error_type: "OUTDATED_INFORMATION", explanation: "old docs" });
  store.decide(wrong.id, { verdict: VERDICTS.INCORRECT, explanation: "It has always been 8123.", correctAnswer: "It listens on port 8123." });

  const made = suite.fromCase(store.get(wrong.id), store.outcome(wrong.id));
  assert.strictEqual(made.created, true);
  assert.ok(made.test.mustContain.includes("8123"), "the right answer must be required");
  assert.ok(made.test.mustNotContain.includes("8321"), "the old wrong answer must be forbidden");
  ok("a correction becomes a test that requires the right answer and forbids the old one");

  // Both directions: an answer that hedges by saying both has not been fixed.
  const hedged = suite.judge(made.test, "It might be 8321, or possibly 8123.");
  assert.strictEqual(hedged.passed, false);
  assert.match(hedged.why, /still repeats the old mistake/);
  ok("an answer that mentions the right value while repeating the wrong one still fails");

  const fixed = suite.judge(made.test, "Home Assistant listens on port 8123.");
  assert.strictEqual(fixed.passed, true);
  const evasive = suite.judge(made.test, "It uses a standard web port.");
  assert.strictEqual(evasive.passed, false);
  assert.match(evasive.why, /never mentions/);
  ok("a corrected answer passes and a vague one does not");

  // --- related questions, honestly labelled ---
  assert.ok(made.test.related.length >= 2, "rephrasings should be generated");
  assert.ok(made.test.related.every((r) => r.writtenBy === "paraphrase"), "and marked as rephrasings, not new concepts");
  suite.addRelated(made.test.id, {
    question: "Which port do I open on the firewall for Home Assistant?",
    mustContain: ["8123"], writtenBy: "human", note: "a genuinely related concept",
  });
  const humanWritten = suite.list()[0].related.filter((r) => r.writtenBy === "human");
  assert.strictEqual(humanWritten.length, 1, "a human-written related test is kept distinct from a rephrasing");
  ok("rephrasings and genuinely related questions are kept distinct by who wrote them");

  // --- replay ---
  const stillWrong = await suite.replay(async () => "It listens on port 8321.");
  assert.strictEqual(stillWrong.summary.failed, 1);
  assert.strictEqual(stillWrong.results[0].status, "failed");
  ok("replaying against the old broken answer reports a failure");

  const nowRight = await suite.replay(async () => "Home Assistant listens on port 8123.");
  assert.strictEqual(nowRight.summary.passed, 1);
  assert.strictEqual(nowRight.results[0].relatedPassed, nowRight.results[0].relatedTotal);
  ok("replaying against the corrected answer passes, including the rephrasings");

  // A fix that only works for the exact original wording is not a real fix.
  const brittle = await suite.replay(async (q) =>
    q === "What port does Home Assistant use?" ? "port 8123" : "I am not sure.");
  assert.strictEqual(brittle.results[0].status, "passed_narrowly");
  assert.ok(brittle.summary.narrow === 1 && brittle.summary.passed === 0);
  ok("a fix that only works for the original wording is reported as narrow, not as passing");

  // --- what does not become a test ---
  const right = store.open({ question: "2+2?", answer: "4" });
  store.decide(right.id, { verdict: VERDICTS.CORRECT });
  assert.strictEqual(suite.fromCase(store.get(right.id), store.outcome(right.id)).created, false);

  const noAnswer = store.open({ question: "Q", answer: "bad" });
  store.decide(noAnswer.id, { verdict: VERDICTS.INCORRECT });
  const cannot = suite.fromCase(store.get(noAnswer.id), store.outcome(noAnswer.id));
  assert.strictEqual(cannot.created, false);
  assert.match(cannot.reason, /no correct answer was given/);

  const unruled = store.open({ question: "Q2", answer: "maybe" });
  store.attachEvaluation(unruled.id, { available: true, correct: false, explanation: "the machine thinks not" });
  const machineOnly = suite.fromCase(store.get(unruled.id), store.outcome(unruled.id));
  assert.strictEqual(machineOnly.created, false);
  assert.match(machineOnly.reason, /unconfirmed opinion is not a fact/);
  ok("correct answers, unstated corrections and machine-only opinions do not become tests");

  // --- persistence and regression detection ---
  const reopened = new RegressionSuite({ file: path.join(tmp, "regression.json") });
  assert.strictEqual(reopened.list().length, 1);
  assert.strictEqual(reopened.list()[0].correctAnswer, "It listens on port 8123.");
  await reopened.replay(async () => "it is 8321 after all");
  const regressed = reopened.regressions();
  assert.strictEqual(regressed.length, 1, "something that passed and then failed is a regression");
  assert.ok(regressed[0].lastPassed, "and it knows when it last worked");
  ok("tests persist, and a test that passed then failed is flagged as a regression");

  // --- patterns become changes of method ---
  const book = new LessonBook({ file: path.join(tmp, "lessons.json") });
  const reviews = [
    { correct: false, error_type: "OUTDATED_INFORMATION", recommended_action: "Check the version on a docs page before trusting it." },
    { correct: false, error_type: "OUTDATED_INFORMATION", recommended_action: "Prefer current official documentation." },
    { correct: false, error_type: "OUTDATED_INFORMATION", recommended_action: "Check the version on a docs page before trusting it." },
  ];
  const [pattern] = findPatterns(reviews);
  const recorded = book.fromPattern(pattern);
  assert.strictEqual(recorded.created, true);
  assert.strictEqual(recorded.lesson.scope, "method", "a lesson is about method, never a fact to memorise");
  assert.match(recorded.lesson.lesson, /method problem/);
  assert.strictEqual(recorded.lesson.suggestions.length, 2, "duplicate advice is collapsed");
  assert.strictEqual(recorded.lesson.applied, false);
  ok("three mistakes of one kind become one recorded change of method, not three facts");

  const again = book.fromPattern({ ...pattern, occurrences: 5 });
  assert.strictEqual(again.created, false);
  assert.strictEqual(again.lesson.occurrences, 5, "a recurring habit updates its count rather than duplicating");
  ok("the same habit recurring updates the existing lesson instead of piling up copies");

  assert.throws(() => book.markApplied(recorded.lesson.id), /Say what was actually changed/);
  book.markApplied(recorded.lesson.id, "Discovery now prefers /openapi.json over search results.");
  assert.strictEqual(book.outstanding().length, 0);
  assert.match(book.list()[0].appliedNote, /prefers/);
  ok("a lesson is only 'applied' when something concrete is named — agreeing is not applying");

  // --- key facts extraction ---
  assert.ok(keyFacts("It listens on port 8123.").includes("8123"));
  assert.ok(keyFacts("Use the `brightness_pct` parameter.").includes("brightness_pct"));
  assert.ok(keyFacts("Prefer official documentation always").length > 0, "prose still yields something checkable");
  ok("numbers, code fragments and key words are all extracted as checkable facts");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\neve/learn: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
