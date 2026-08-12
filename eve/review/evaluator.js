/* evaluator.js — a second opinion on work EVE has already finished.
 *
 * Strictly after the fact. The evaluator is handed a completed case — the
 * question, the answer EVE already gave, what she used to get there — and
 * returns an opinion. It has no route back into answering: nothing here can
 * change a reply, and by the time this runs the reply has been given.
 *
 * It is advisory. A review never rewrites EVE, never installs anything, and
 * never outranks a human. Its output is filed on the case and waits.
 *
 * The provider is pluggable. Groq is one transport; anything with a
 * `complete(system, user)` method works, including a local model later.
 */
"use strict";

/** Why an answer was wrong, from the brief. The taxonomy is the point: the
 *  same error type recurring is the signal that a *strategy* needs to change,
 *  not that three more answers need memorising. */
const ERROR_TYPES = [
  "FACTUAL_ERROR", "OUTDATED_INFORMATION", "BAD_SOURCE", "INSUFFICIENT_RESEARCH",
  "REASONING_ERROR", "CODING_ERROR", "TOOL_ERROR", "INTEGRATION_ERROR",
  "MEMORY_ERROR", "MISUNDERSTANDING",
];

const SEVERITIES = ["low", "medium", "high", "critical"];

const SYSTEM_PROMPT = `You review the work of a small assistant called EVE. You are not talking to a user and you are not answering their question.

You are given a task EVE already completed and the answer she already gave. Judge that answer.

Be sceptical. Try to disprove it before accepting it. If you cannot tell whether it is right, say so with low confidence rather than guessing — an uncertain reviewer is useful, a falsely confident one is worse than none.

Reply with only a JSON object:
{
  "correct": true | false,
  "confidence": 0.0 to 1.0,
  "severity": "low" | "medium" | "high" | "critical",
  "error_type": one of ${ERROR_TYPES.join(", ")} or null when correct,
  "explanation": one or two sentences on what is actually wrong,
  "recommended_action": what EVE should do differently next time, aimed at her method rather than this one answer
}`;

/** The shape every review is forced into, whatever the model returned. */
function normalise(raw, { provider }) {
  const clamp = (n) => Math.max(0, Math.min(1, Number(n)));
  const correct = raw.correct === true;
  const confidence = Number.isFinite(Number(raw.confidence)) ? clamp(raw.confidence) : 0;

  let errorType = raw.error_type == null ? null : String(raw.error_type).toUpperCase();
  // A type the taxonomy does not know is recorded as unclassified rather than
  // invented into the list, so the pattern counts stay meaningful.
  if (errorType && !ERROR_TYPES.includes(errorType)) errorType = "UNCLASSIFIED";
  if (correct) errorType = null;

  const severity = SEVERITIES.includes(String(raw.severity).toLowerCase())
    ? String(raw.severity).toLowerCase()
    : (correct ? "low" : "medium");

  return {
    correct,
    confidence,
    severity,
    error_type: errorType,
    explanation: String(raw.explanation || "").slice(0, 1000) || "no explanation given",
    recommended_action: String(raw.recommended_action || "").slice(0, 1000) || null,
    provider,
    reviewedAt: new Date().toISOString(),
    advisory: true, // never treated as a decision
  };
}

class Evaluator {
  /**
   * `transport` is anything with complete(system, user) → string.
   * With none, the evaluator is simply unavailable — a supported state, not a
   * failure, because the Pi may be offline or you may not want a cloud reviewer.
   */
  constructor({ transport = null, log = null } = {}) {
    this.transport = transport;
    this.log = log;
  }

  available() { return !!this.transport; }

  /** What the reviewer is shown. Built from an already-finished case. */
  buildPrompt(reviewCase) {
    const parts = [
      `TASK EVE WAS GIVEN:\n${reviewCase.question}`,
      `\nTHE ANSWER SHE ALREADY GAVE:\n${reviewCase.answer}`,
    ];
    if (reviewCase.sources?.length) {
      parts.push(`\nSOURCES SHE USED:\n${reviewCase.sources.map((s) => `- ${s.url || s} (${s.kind || "unknown kind"})`).join("\n")}`);
    }
    if (reviewCase.research) parts.push(`\nRESEARCH SHE DID:\n${reviewCase.research}`);
    if (reviewCase.tools?.length) parts.push(`\nTOOLS SHE USED:\n${reviewCase.tools.join(", ")}`);
    if (reviewCase.code) parts.push(`\nCODE SHE PRODUCED:\n${reviewCase.code}`);
    if (reviewCase.conversation) parts.push(`\nCONVERSATION CONTEXT:\n${reviewCase.conversation}`);
    if (reviewCase.selfDoubt) parts.push(`\nWHAT EVE HERSELF WAS UNSURE ABOUT:\n${reviewCase.selfDoubt}`);
    return parts.join("\n");
  }

  /**
   * Review a finished case. Never throws into the caller: a reviewer that is
   * down, slow or talking nonsense must not break EVE, so every failure comes
   * back as an unavailable review with the reason attached.
   */
  async review(reviewCase) {
    if (!this.transport) {
      return { available: false, reason: "no external reviewer is configured", advisory: true };
    }
    let text;
    try {
      text = await this.transport.complete(SYSTEM_PROMPT, this.buildPrompt(reviewCase));
    } catch (err) {
      this.log?.warn("the external reviewer could not be reached", { error: err.message });
      return { available: false, reason: `the reviewer could not be reached: ${err.message}`, advisory: true };
    }

    let parsed;
    try {
      // Models sometimes wrap JSON in prose or fences even when told not to.
      const match = String(text).match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text);
    } catch {
      this.log?.warn("the external reviewer returned something unreadable");
      return { available: false, reason: "the reviewer returned something that was not a review", advisory: true };
    }

    const review = normalise(parsed, { provider: this.transport.provider || "unknown" });
    this.log?.event("review", { correct: review.correct, error_type: review.error_type, confidence: review.confidence });
    return { available: true, ...review };
  }
}

/**
 * Count error types across many reviews, so a repeated failure shows up as a
 * pattern. Three outdated-documentation mistakes are not three facts to learn;
 * they are one research strategy to change.
 */
function findPatterns(reviews, { minimumOccurrences = 3 } = {}) {
  const counts = new Map();
  for (const review of reviews) {
    if (!review || review.correct || !review.error_type) continue;
    const list = counts.get(review.error_type) || [];
    list.push(review);
    counts.set(review.error_type, list);
  }
  return [...counts.entries()]
    .filter(([, list]) => list.length >= minimumOccurrences)
    .map(([errorType, list]) => ({
      errorType,
      occurrences: list.length,
      // The advice EVE should act on is the one her reviewers keep repeating.
      suggestions: [...new Set(list.map((r) => r.recommended_action).filter(Boolean))],
      lesson: `${errorType} has happened ${list.length} times — this is a method problem, not ${list.length} separate facts to memorise.`,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

module.exports = { Evaluator, findPatterns, normalise, ERROR_TYPES, SEVERITIES, SYSTEM_PROMPT };
