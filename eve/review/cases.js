/* cases.js — review cases: what EVE got wrong, what she was told about it.
 *
 * A case is opened when an answer might be wrong. It carries the question, the
 * answer already given, what EVE used, and — if a reviewer was available — an
 * advisory evaluation. Then it waits for you.
 *
 * Two rules are enforced rather than assumed:
 *
 *   The human outranks the machine. A verdict from you replaces the external
 *   reviewer's opinion outright. If the reviewer said wrong and you say right,
 *   the case is right, and the reviewer's opinion is kept only as a record of
 *   it having been mistaken.
 *
 *   Nothing leaves without a privacy scope. Review material can include your
 *   conversation, so what is sent is decided by an explicit setting, and
 *   "do not send" genuinely sends nothing.
 */
"use strict";

const path = require("path");
const storage = require("../kernel/storage.js");

const VERDICTS = {
  CORRECT: "correct",
  INCORRECT: "incorrect",
  PARTIAL: "partially_correct",
  NEEDS_RESEARCH: "needs_more_research",
};

/** How much context may accompany a case off this machine. */
const PRIVACY = {
  FULL: "full_conversation",
  RELEVANT: "relevant_conversation",
  DISPUTED: "disputed_exchange_only",
  NONE: "do_not_send",
};

/**
 * Strip a case down to what the chosen privacy scope permits.
 * Applied before anything is handed to an external reviewer or sent to your PC.
 */
function applyPrivacy(reviewCase, scope) {
  if (scope === PRIVACY.NONE) return null;

  const base = {
    id: reviewCase.id,
    question: reviewCase.question,
    answer: reviewCase.answer,
    createdAt: reviewCase.createdAt,
  };
  if (scope === PRIVACY.DISPUTED) return base;

  const withWork = {
    ...base,
    sources: reviewCase.sources || [],
    research: reviewCase.research || null,
    tools: reviewCase.tools || [],
    code: reviewCase.code || null,
    selfDoubt: reviewCase.selfDoubt || null,
  };
  if (scope === PRIVACY.RELEVANT) return withWork;

  return { ...withWork, conversation: reviewCase.conversation || null };
}

class CaseStore {
  constructor({ file = null, log = null, privacy = PRIVACY.RELEVANT } = {}) {
    this.file = file;
    this.log = log;
    this.privacy = privacy;
    this.cases = [];
    if (file) {
      const loaded = storage.readWithFallback(file, []);
      this.cases = Array.isArray(loaded.value) ? loaded.value : [];
      if (!loaded.ok && loaded.reason) log?.warn(`review cases: ${loaded.reason}`);
    }
  }

  _save() {
    if (this.file) storage.writeJsonVersioned(this.file, this.cases);
  }

  /**
   * Open a case. `why` records what made EVE doubt this — low confidence, a
   * failed verification, a user frowning at it.
   */
  open({ question, answer, why, sources, research, tools, code, conversation, selfDoubt, confidence }) {
    if (!question || answer === undefined) throw new Error("A review case needs the question and the answer that was given.");
    const reviewCase = {
      id: `case-${Date.now().toString(36)}-${this.cases.length}`,
      createdAt: new Date().toISOString(),
      question, answer, why: why || "flagged for review",
      confidence: confidence ?? null,
      sources: sources || [], research: research || null, tools: tools || [],
      code: code || null, conversation: conversation || null, selfDoubt: selfDoubt || null,
      evaluation: null,     // advisory, from the external reviewer
      human: null,          // authoritative, from you
      status: "open",
      lesson: null,
    };
    this.cases.push(reviewCase);
    this._save();
    this.log?.event("review_case_opened", { id: reviewCase.id, why: reviewCase.why });
    return reviewCase;
  }

  get(id) { return this.cases.find((c) => c.id === id) || null; }

  /** What may be sent, under the configured scope. Null means send nothing. */
  payloadFor(id, scope = this.privacy) {
    const reviewCase = this.get(id);
    if (!reviewCase) return null;
    return applyPrivacy(reviewCase, scope);
  }

  /** File the external reviewer's opinion. Advisory: it changes no verdict. */
  attachEvaluation(id, evaluation) {
    const reviewCase = this.get(id);
    if (!reviewCase) throw new Error(`No case ${id}`);
    reviewCase.evaluation = { ...evaluation, advisory: true };
    if (!reviewCase.human) reviewCase.status = evaluation.available ? "evaluated" : "open";
    this._save();
    return reviewCase;
  }

  /**
   * Your verdict. This is the authoritative one: it settles the case and
   * overrides whatever the external reviewer thought.
   */
  decide(id, { verdict, explanation = null, correctAnswer = null, decidedBy = "user" }) {
    const reviewCase = this.get(id);
    if (!reviewCase) throw new Error(`No case ${id}`);
    if (!Object.values(VERDICTS).includes(verdict)) {
      throw new Error(`Unknown verdict "${verdict}". Use one of: ${Object.values(VERDICTS).join(", ")}`);
    }
    reviewCase.human = { verdict, explanation, correctAnswer, decidedBy, decidedAt: new Date().toISOString() };
    reviewCase.status = verdict === VERDICTS.NEEDS_RESEARCH ? "needs_research" : "settled";

    // Record where the machine disagreed with you — that is data about the
    // reviewer's reliability, which matters when weighing it in future.
    const machineSaidCorrect = reviewCase.evaluation?.available && reviewCase.evaluation.correct;
    const humanSaysCorrect = verdict === VERDICTS.CORRECT;
    reviewCase.reviewerAgreed = reviewCase.evaluation?.available ? machineSaidCorrect === humanSaysCorrect : null;

    this._save();
    this.log?.event("review_case_decided", { id, verdict, reviewerAgreed: reviewCase.reviewerAgreed });
    return reviewCase;
  }

  /**
   * The settled truth about a case, and who established it.
   * Falls back to the advisory review only when you have not ruled.
   */
  outcome(id) {
    const reviewCase = this.get(id);
    if (!reviewCase) return null;
    if (reviewCase.human) {
      return {
        correct: reviewCase.human.verdict === VERDICTS.CORRECT,
        verdict: reviewCase.human.verdict,
        authority: "human",
        explanation: reviewCase.human.explanation,
        correctAnswer: reviewCase.human.correctAnswer,
      };
    }
    if (reviewCase.evaluation?.available) {
      return {
        correct: reviewCase.evaluation.correct,
        verdict: reviewCase.evaluation.correct ? VERDICTS.CORRECT : VERDICTS.INCORRECT,
        authority: "external reviewer (advisory — not confirmed by a human)",
        explanation: reviewCase.evaluation.explanation,
        errorType: reviewCase.evaluation.error_type,
      };
    }
    return { correct: null, verdict: null, authority: "nobody has ruled on this yet", explanation: null };
  }

  open_cases() { return this.cases.filter((c) => c.status === "open" || c.status === "evaluated"); }
  settled() { return this.cases.filter((c) => c.status === "settled"); }

  /** How often the external reviewer agreed with you, once you ruled. */
  reviewerReliability() {
    const judged = this.cases.filter((c) => c.reviewerAgreed !== null && c.reviewerAgreed !== undefined);
    if (!judged.length) return { samples: 0, agreementRate: null };
    const agreed = judged.filter((c) => c.reviewerAgreed).length;
    return {
      samples: judged.length,
      agreementRate: agreed / judged.length,
      note: "how often the external reviewer matched your verdict — low means weight it less",
    };
  }
}

module.exports = { CaseStore, VERDICTS, PRIVACY, applyPrivacy };
