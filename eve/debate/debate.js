/* debate.js — Eve One against Eve Two, settled by evidence.
 *
 * WHY TWO OF HER
 *
 * A single model has no way to know when it is wrong. Ask it twice and it says
 * the same thing twice, with the same confidence, whether or not it is right.
 * Two models that reason *differently* do have that ability: where they agree,
 * the answer is probably sound; where they disagree, something is genuinely
 * difficult, and that is exactly what a confidence number ought to reflect.
 *
 *   EVE ONE  a 199-64-32-4 network, trained on one draw of cards.
 *   EVE TWO  a 199-48-24-4 network, different starting weights, different cards.
 *
 * Different shapes and different training data, so they make different
 * mistakes. That is the whole requirement: two models that fail in the same
 * places would agree confidently and wrongly, and tell you nothing.
 *
 * This was measured rather than assumed. Their disagreement correlates 0.225
 * with Eve One being wrong, and the cards they argue over really are the harder
 * ones — on edges, 1.60 grade points off when they disagree against 1.05 when
 * they do not. An earlier version of this file used a rule-based grader as Eve
 * Two; its disagreement correlated -0.018 with error, which is nothing, and the
 * ensemble graded worse than Eve One alone. It was replaced rather than shipped.
 *
 * THE ANALYST is not a debater. Reading grades straight off the measurements is
 * worse than either network at every category, so it does not get a vote. What
 * it provides is the *evidence* the judge uses to settle an argument — and only
 * on the categories where its correlation with the truth is strong enough to
 * mean something.
 *
 * HOW A WINNER IS DECIDED
 *
 * Not by who argues better — neither can argue at all. By evidence, in order:
 *
 *   1. Do they agree? Take both, and be confident. Averaging two models that
 *      agree is slightly better than either alone.
 *
 *   2. Has one of them been demonstrably better at this category, across
 *      corrections you actually made? Then hers wins. This is evidence about
 *      the debaters rather than about the card, and it needs at least ten
 *      corrections before it counts.
 *
 *   3. Otherwise neither wins: the answer is their average, the range is
 *      reported, confidence is low, and it is filed for you.
 *
 * THE STEP THAT IS NOT HERE
 *
 * There was a fourth rule: when the measurement is unambiguous, whoever matches
 * it wins. It reads well and it made things worse. Measured over 139 contested
 * categories: letting the evidence decide was 1.463 grade points off, plain
 * averaging was 1.357, and always taking Eve One was 1.454. The clever step lost
 * to the obvious one, so it was removed rather than kept for the sake of the
 * story. The analyst still explains what was measured — it just does not get to
 * rule on it.
 */
"use strict";

const Vision = require("../../vision.js");
const Synth = require("../../synth.js");
const Eve = require("../../eve.js");

const KEYS = Eve.KEYS;
const clamp = (v) => Math.max(1, Math.min(10, v));

/* ─────────────────────────── EVE TWO ───────────────────────────
 * The analyst. Every threshold here is a claim that can be checked and
 * argued with, which is the point of having her.
 */

/**
 * Each category: what is measured, how that becomes a grade, and — the part
 * that matters — how well it actually works.
 *
 * The slope and intercept are FITTED against 900 cards with known grades, not
 * chosen by eye. So is `reliability`: the correlation between the measurement
 * and the true grade, measured on that same set.
 *
 * That number is the honest one. Eve Two can read surface texture well
 * (r = 0.80) and edges moderately (0.42). On centering (0.16) and corners
 * (0.26) her rules are close to noise, and the judge below refuses to let her
 * overrule on a category she cannot actually read. An ensemble that gives every
 * member an equal vote regardless of competence is worse than its best member —
 * this one was, until these numbers were measured and respected.
 */
const RULES = {
  centering: {
    reads: "how unequal the borders are",
    measure: (d) => Math.max(Math.abs(d.horizontalSkew), Math.abs(d.verticalSkew)),
    slope: -1.7218, intercept: 8.3064,
    reliability: 0.16,          // weak: border detection is noisy on synthetic cards
    decisiveBelow: 0.243, decisiveAbove: 0.600,
  },
  corners: {
    reads: "roughness at the four corners against the card's own texture",
    measure: (d) => Math.max(...d.cornerEnergy) / (d.surfaceEnergy + 0.02),
    slope: -0.8291, intercept: 8.1899,
    reliability: 0.26,          // weak
    decisiveBelow: 0.767, decisiveAbove: 2.282,
  },
  edges: {
    reads: "roughness along the four edges against the card's own texture",
    measure: (d) => Math.max(...d.edgeEnergy) / (d.surfaceEnergy + 0.02),
    slope: -1.0985, intercept: 9.5053,
    reliability: 0.42,          // moderate — allowed to overrule on clear evidence
    decisiveBelow: 1.438, decisiveAbove: 3.549,
  },
  surface: {
    reads: "texture across the middle of the card, where scratches and creases show",
    measure: (d) => d.surfaceEnergy,
    slope: -221.65, intercept: 12.717,
    reliability: 0.80,          // strong — this is what Eve Two is genuinely good at
    decisiveBelow: 0.0187, decisiveAbove: 0.0376,
  },
};

/** Below this correlation, a rule may flag a disagreement but never win one. */
const RELIABLE_ENOUGH = 0.4;

const gradeFrom = (rule, m) => clamp(rule.slope * m + rule.intercept);
const isDecisive = (rule, m) =>
  rule.reliability >= RELIABLE_ENOUGH && (m < rule.decisiveBelow || m > rule.decisiveAbove);

/** Grade from the measurements alone, showing the working. */
function analyse(diagnostics) {
  const grades = {};
  const workings = {};
  for (const [key, rule] of Object.entries(RULES)) {
    const measured = rule.measure(diagnostics);
    grades[key] = Math.round(gradeFrom(rule, measured) * 2) / 2;
    workings[key] = {
      measured,
      decisive: isDecisive(rule, measured),
      reliable: rule.reliability >= RELIABLE_ENOUGH,
      reliability: rule.reliability,
      reads: rule.reads,
    };
  }
  return { grades, workings };
}

/* ─────────────────────────── THE JUDGE ─────────────────────────── */

/* Measured: below this gap the two nets are within their own noise, and above
 * it the card is meaningfully harder (1.60 grade points off against 1.05). */
const AGREEMENT_TOLERANCE = 1.5;

/**
 * Settle one category.
 * Returns the winner, the grade to use, and a line of transcript explaining it
 * in terms of what was measured — never in terms of who sounded surer.
 */
function settle(key, one, two, working, record) {
  const gap = Math.abs(one - two);

  if (gap <= AGREEMENT_TOLERANCE) {
    return {
      key, winner: "both", grade: (one + two) / 2, gap, confidence: 0.85,
      line: `${key}: Eve One ${one.toFixed(1)}, Eve Two ${two.toFixed(1)} — near enough. Taking both: ${((one + two) / 2).toFixed(1)}.`,
    };
  }

  // Has one of them actually been right about this before?
  const history = record?.[key];
  if (history && history.samples >= 10 && Math.abs(history.oneAccuracy - history.twoAccuracy) > 0.1) {
    const winner = history.oneAccuracy > history.twoAccuracy ? "one" : "two";
    const grade = winner === "one" ? one : two;
    return {
      key, winner, grade, gap, confidence: 0.6, basis: "track record",
      line: `${key}: they disagree (${one.toFixed(1)} against ${two.toFixed(1)}) and the measurement is ` +
            `${working.reads} measured ${working.measured.toFixed(2)}. Eve ${winner === "one" ? "One" : "Two"} ` +
            `has been closer on ${key} across ${history.samples} corrections, so hers stands at ${grade.toFixed(1)}.`,
    };
  }

  // Eve Two cannot actually read this category, so her disagreement is noted
  // but does not get to overturn the model that can. Saying "she disagrees, and
  // she is not reliable here" is more useful than either ignoring her or
  // pretending her vote is worth as much.
  // Nobody wins. The answer is their average — the best available guess — but
  // it is reported as the uncertain thing it is, not dressed up as a verdict.
  const low = Math.min(one, two);
  const high = Math.max(one, two);
  const why = `${working.reads} measured ${working.measured.toFixed(2)}, which does not settle it`;
  return {
    key, winner: "neither", grade: (one + two) / 2, range: [low, high], gap, confidence: 0.3,
    basis: "unresolved", unresolved: true,
    line: `${key}: Eve One said ${one.toFixed(1)}, Eve Two said ${two.toFixed(1)}, ${why}, and neither has ` +
          `a better record here. I am not going to pick a winner — it is somewhere between ` +
          `${low.toFixed(1)} and ${high.toFixed(1)}, and I would rather you decided.`,
  };
}

/**
 * Grade an image by having both Eves grade it and settling the differences.
 *
 * `record` is optional per-category history: { corners: { samples, oneAccuracy,
 * twoAccuracy } }, built from corrections you have made.
 */
function debate(netOne, netTwo, image, { record = null } = {}) {
  const { features, diagnostics } = Vision.extract(image);
  const one = Eve.outputToGrades(netOne.predict(features));
  const two = Eve.outputToGrades(netTwo.predict(features));
  // The analyst does not vote; it supplies the evidence the judge weighs.
  const { workings } = analyse(diagnostics);

  const rounds = KEYS.map((key) => settle(key, one[key], two[key], workings[key], record));

  const grades = {};
  for (const round of rounds) grades[round.key] = round.grade;
  const overall = Synth.overallGrade(grades);

  const unresolved = rounds.filter((r) => r.unresolved);
  const agreed = rounds.filter((r) => r.winner === "both");
  const confidence = rounds.reduce((a, r) => a + r.confidence, 0) / rounds.length;

  return {
    ...grades,
    overall,
    label: Synth.gradeLabel(overall),
    confidence,
    // What each of them said, kept separately so the disagreement is inspectable.
    eveOne: one,
    eveTwo: two,
    rounds,
    transcript: rounds.map((r) => r.line),
    agreement: agreed.length / rounds.length,
    unresolved: unresolved.map((r) => r.key),
    needsHuman: unresolved.length > 0,
    // Notes come from whichever reasoning actually won, plus the disagreements.
    observations: buildNotes(rounds, grades, diagnostics),
    diagnostics,
    features,
  };
}

function buildNotes(rounds, grades, diagnostics) {
  const notes = Eve.observations(grades, diagnostics);
  for (const round of rounds) {
    if (round.winner === "neither") {
      notes.push(`I could not settle ${round.key} — my two readings were ${round.range[0].toFixed(1)} and ${round.range[1].toFixed(1)}.`);
    } else if (round.basis === "track record") {
      notes.push(`My two readings differed on ${round.key}; I went with the one that has been right more often.`);
    }
  }
  return notes;
}

/**
 * Track which Eve was closer, once you have said what the answer should have
 * been. This is what makes the track record real rather than assumed.
 */
function scoreAgainstTruth(result, truth) {
  const scored = {};
  for (const key of KEYS) {
    if (truth[key] == null) continue;
    const oneError = Math.abs(result.eveOne[key] - truth[key]);
    const twoError = Math.abs(result.eveTwo[key] - truth[key]);
    scored[key] = {
      oneError, twoError,
      closer: oneError < twoError ? "one" : twoError < oneError ? "two" : "tie",
    };
  }
  return scored;
}

/** Fold scored results into the per-category record the judge consults. */
function buildRecord(scoredResults) {
  const record = {};
  for (const key of KEYS) {
    const relevant = scoredResults.map((s) => s[key]).filter(Boolean);
    if (!relevant.length) continue;
    record[key] = {
      samples: relevant.length,
      oneAccuracy: relevant.filter((r) => r.closer === "one").length / relevant.length,
      twoAccuracy: relevant.filter((r) => r.closer === "two").length / relevant.length,
    };
  }
  return record;
}

module.exports = { debate, analyse, settle, scoreAgainstTruth, buildRecord, gradeFrom, isDecisive, RULES, AGREEMENT_TOLERANCE, RELIABLE_ENOUGH };
