/* regression.js — turning corrections into tests EVE has to keep passing.
 *
 * A correction that only fixes one answer is worth very little. The point of
 * this file is that being told something is wrong leaves behind two things:
 *
 *   A regression test, so the same mistake cannot come back quietly. It checks
 *   both directions — the right answer must appear, and the wrong one must not,
 *   because an answer that hedges by saying both has not been fixed.
 *
 *   A lesson, when the same *kind* of mistake keeps happening. Three
 *   out-of-date answers are not three facts to memorise; they are one research
 *   habit to change, and the lesson is written about the habit.
 *
 * Honest limit, stated once: EVE has no language model of her own, so the
 * "related tests" she generates are rephrasings of the same question. Those do
 * test that a fix generalises past one exact wording — which is real, and worth
 * having — but genuinely *related concepts* need either you or a model to
 * write, and are marked by who wrote them so the distinction never blurs.
 */
"use strict";

const storage = require("../kernel/storage.js");

const normalise = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Distinctive bits of the correct answer that a future answer must contain. */
function keyFacts(text) {
  const raw = String(text ?? "");
  const facts = new Set();
  // Numbers, versions, ports and identifiers are what corrections usually turn on.
  for (const match of raw.matchAll(/\b\d[\w.:-]*\b/g)) facts.add(match[0]);
  // Quoted or code-ish fragments.
  for (const match of raw.matchAll(/[`"']([^`"']{2,40})[`"']/g)) facts.add(match[1]);
  // Otherwise fall back to the longest words, which carry the most meaning.
  if (!facts.size) {
    normalise(raw).split(" ").filter((w) => w.length > 4).sort((a, b) => b.length - a.length)
      .slice(0, 3).forEach((w) => facts.add(w));
  }
  return [...facts].slice(0, 6);
}

/** Rephrasings, so a fix has to survive being asked differently. */
function paraphrase(question) {
  const q = String(question).trim().replace(/\?+$/, "");
  const bare = q.replace(/^(what|which|how|where|when|who)\s+(is|are|do|does|did)\s+/i, "").trim();
  const variants = new Set([
    `${q}?`,
    `${bare}?`,
    `tell me ${bare}`,
    `do you know ${bare}`,
    `${q.toLowerCase()}`,
  ]);
  variants.delete(q);
  return [...variants].filter(Boolean).slice(0, 4);
}

class RegressionSuite {
  constructor({ file = null, log = null } = {}) {
    this.file = file;
    this.log = log;
    const loaded = file ? storage.readWithFallback(file, []) : { value: [] };
    this.tests = Array.isArray(loaded.value) ? loaded.value : [];
    if (loaded.reason && loaded.reason !== "not present") log?.warn(`regression tests: ${loaded.reason}`);
  }

  _save() { if (this.file) storage.writeJsonVersioned(this.file, this.tests); }

  /**
   * Build a test from a case you have ruled on.
   *
   * Only from corrections: a case you marked correct has nothing to learn from,
   * and a case nobody has ruled on is not settled enough to test against.
   */
  fromCase(reviewCase, outcome) {
    if (!outcome || outcome.authority !== "human") {
      return { created: false, reason: "only a case you have ruled on becomes a test — an unconfirmed opinion is not a fact" };
    }
    if (outcome.correct) {
      return { created: false, reason: "the answer was right; there is nothing to guard against" };
    }
    const correctAnswer = outcome.correctAnswer;
    if (!correctAnswer) {
      return { created: false, reason: "marked wrong, but no correct answer was given — I cannot test for an answer nobody stated" };
    }

    const facts = keyFacts(correctAnswer);
    const test = {
      id: `reg-${Date.now().toString(36)}-${this.tests.length}`,
      createdAt: new Date().toISOString(),
      fromCase: reviewCase.id,
      question: reviewCase.question,
      previousAnswer: reviewCase.answer,
      correctAnswer,
      errorType: reviewCase.evaluation?.error_type || null,
      explanation: outcome.explanation || null,
      // Both directions matter: an answer that mentions the right value while
      // still repeating the wrong one has not actually been fixed.
      mustContain: facts,
      mustNotContain: keyFacts(reviewCase.answer).filter((f) => !facts.includes(f)),
      writtenBy: "human_correction",
      related: [],
      runs: [],
    };

    for (const variant of paraphrase(reviewCase.question)) {
      test.related.push({ question: variant, writtenBy: "paraphrase", note: "same question, different wording" });
    }

    this.tests.push(test);
    this._save();
    this.log?.event("regression_test_created", { id: test.id, fromCase: reviewCase.id, related: test.related.length });
    return { created: true, test };
  }

  /** A genuinely related case you or a model wrote — kept distinct from paraphrases. */
  addRelated(testId, { question, mustContain = [], writtenBy = "human", note = null }) {
    const test = this.tests.find((t) => t.id === testId);
    if (!test) throw new Error(`No regression test ${testId}`);
    test.related.push({ question, mustContain, writtenBy, note });
    this._save();
    return test;
  }

  /** Does an answer satisfy a test? Returns why, not just whether. */
  judge(test, answer, { mustContain = test.mustContain, mustNotContain = test.mustNotContain } = {}) {
    const text = normalise(answer);
    const missing = (mustContain || []).filter((f) => !text.includes(normalise(f)));
    const repeated = (mustNotContain || []).filter((f) => text.includes(normalise(f)));
    return {
      passed: missing.length === 0 && repeated.length === 0,
      missing,
      repeated,
      why: missing.length
        ? `the answer never mentions ${missing.join(", ")}`
        : repeated.length
          ? `the answer still repeats the old mistake (${repeated.join(", ")})`
          : "the answer contains what it should and none of what it should not",
    };
  }

  /**
   * Replay every test against however EVE answers now.
   *
   * `answer` is async (question) => string. Related questions are replayed too,
   * so a fix that only works for the original wording is reported as a partial
   * pass rather than a pass.
   */
  async replay(answer, { only = null } = {}) {
    const results = [];
    for (const test of this.tests) {
      if (only && !only.includes(test.id)) continue;

      let mainResult;
      try {
        mainResult = this.judge(test, await answer(test.question));
      } catch (err) {
        mainResult = { passed: false, why: `answering threw: ${err.message}`, missing: [], repeated: [] };
      }

      const relatedResults = [];
      for (const related of test.related) {
        try {
          const judged = this.judge(test, await answer(related.question), {
            mustContain: related.mustContain?.length ? related.mustContain : test.mustContain,
          });
          relatedResults.push({ question: related.question, writtenBy: related.writtenBy, ...judged });
        } catch (err) {
          relatedResults.push({ question: related.question, passed: false, why: `answering threw: ${err.message}` });
        }
      }

      const relatedPassed = relatedResults.filter((r) => r.passed).length;
      const status = !mainResult.passed
        ? "failed"
        : relatedPassed === relatedResults.length
          ? "passed"
          : "passed_narrowly"; // right answer, but only when asked the original way

      const record = {
        id: test.id, question: test.question, status,
        main: mainResult,
        related: relatedResults,
        relatedPassed, relatedTotal: relatedResults.length,
      };
      results.push(record);
      test.runs.push({ at: new Date().toISOString(), status });
      if (test.runs.length > 50) test.runs = test.runs.slice(-50);
    }
    this._save();

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === "passed").length,
      narrow: results.filter((r) => r.status === "passed_narrowly").length,
      failed: results.filter((r) => r.status === "failed").length,
    };
    this.log?.event("regression_replay", summary);
    return { summary, results };
  }

  /** Tests that have regressed since they last passed. */
  regressions() {
    return this.tests
      .filter((t) => t.runs.length >= 2 && t.runs.at(-1).status === "failed" && t.runs.some((r) => r.status !== "failed"))
      .map((t) => ({ id: t.id, question: t.question, lastPassed: [...t.runs].reverse().find((r) => r.status !== "failed")?.at }));
  }

  list() { return this.tests; }
}

/* ---------------------------------------------------------------------------
 * Lessons — what to change, as opposed to what to remember.
 * ------------------------------------------------------------------------- */

class LessonBook {
  constructor({ file = null, log = null } = {}) {
    this.file = file;
    this.log = log;
    const loaded = file ? storage.readWithFallback(file, []) : { value: [] };
    this.lessons = Array.isArray(loaded.value) ? loaded.value : [];
  }

  _save() { if (this.file) storage.writeJsonVersioned(this.file, this.lessons); }

  /**
   * Turn a repeated failure into a change of method.
   *
   * The wording matters here and is deliberate: a lesson is about how EVE works,
   * not about the answers she got wrong. "Check the version before trusting a
   * documentation page" survives; "Home Assistant uses port 8123" is a fact and
   * belongs in a regression test instead.
   */
  fromPattern(pattern) {
    const existing = this.lessons.find((l) => l.errorType === pattern.errorType);
    if (existing) {
      existing.occurrences = pattern.occurrences;
      existing.updatedAt = new Date().toISOString();
      existing.suggestions = [...new Set([...existing.suggestions, ...pattern.suggestions])];
      this._save();
      return { created: false, lesson: existing, note: "this habit was already recorded; the count went up" };
    }
    const lesson = {
      id: `lesson-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      errorType: pattern.errorType,
      occurrences: pattern.occurrences,
      lesson: pattern.lesson,
      suggestions: pattern.suggestions,
      scope: "method",     // never "fact" — facts are regression tests
      applied: false,
      appliedNote: null,
    };
    this.lessons.push(lesson);
    this._save();
    this.log?.event("lesson_recorded", { errorType: lesson.errorType, occurrences: lesson.occurrences });
    return { created: true, lesson };
  }

  /** Mark that a lesson actually changed something, with what it changed. */
  markApplied(id, note) {
    const lesson = this.lessons.find((l) => l.id === id);
    if (!lesson) throw new Error(`No lesson ${id}`);
    if (!note) throw new Error("Say what was actually changed — a lesson is not applied by agreeing with it.");
    lesson.applied = true;
    lesson.appliedNote = note;
    lesson.appliedAt = new Date().toISOString();
    this._save();
    return lesson;
  }

  outstanding() { return this.lessons.filter((l) => !l.applied); }
  list() { return this.lessons; }
}

module.exports = { RegressionSuite, LessonBook, keyFacts, paraphrase, normalise };
