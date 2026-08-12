/* The correction system: an external reviewer that can look at EVE's finished
 * work and nothing else, and a human whose word beats it.
 * Run with:  node test/review.test.js  */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { Evaluator, findPatterns, ERROR_TYPES } = require("../eve/review/evaluator.js");
const { CaseStore, VERDICTS, PRIVACY, applyPrivacy } = require("../eve/review/cases.js");
const { Vault } = require("../eve/kernel/vault.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-review-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

/** A stand-in reviewer, so none of this needs the network. */
const fakeTransport = (reply) => ({
  provider: "fake",
  lastPrompt: null,
  async complete(system, user) { this.lastPrompt = { system, user }; return typeof reply === "function" ? reply(user) : reply; },
});

(async () => {
  // ------------------------------------- no cloud reviewer exists any more
  //
  // This used to police where Groq was allowed to appear. It now asserts
  // something simpler and stronger: there is no cloud reviewer in the project
  // at all. No key, no account, no outbound request from any of it.
  //
  // What replaced it is local — two networks grading the same card and their
  // disagreement becoming the confidence. See eve/debate/.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "eve-skills", "eve-data"].includes(entry.name)) continue;
        walk(full);
      } else if (entry.name.endsWith(".js")) {
        const rel = path.relative(path.join(__dirname, ".."), full);
        if (rel.startsWith(`test${path.sep}`)) continue;
        const body = fs.readFileSync(full, "utf8");
        // app.js keeps a bring-your-own-key provider list, which holds no
        // credential and only ever uses a key the user typed in themselves.
        if (/api\.groq\.com|GROQ_API_KEY|groq_api_key/i.test(body) && rel !== "app.js") offenders.push(rel);
      }
    }
  };
  walk(path.join(__dirname, ".."));
  assert.deepStrictEqual(offenders, [],
    `no file should reach for a cloud reviewer any more, but these do: ${offenders.join(", ")}`);
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "eve", "review", "groq.js")),
    "the Groq transport should be gone, not merely unused");
  ok("there is no cloud reviewer anywhere in the project — no key, no account, no request");

  // The evaluator keeps its shape so a local model could be plugged in later,
  // but nothing ships one, so it reports unavailable and EVE carries on.
  const evaluatorWithout = new Evaluator({ transport: null });
  assert.strictEqual(evaluatorWithout.available(), false);
  const noReview = await evaluatorWithout.review({ question: "q", answer: "a" });
  assert.strictEqual(noReview.available, false);
  assert.match(noReview.reason, /no external reviewer/);
  ok("with nothing plugged in, the evaluator says so plainly instead of failing");

  // ---------------------------------------------- reviewing
  const good = new Evaluator({
    transport: fakeTransport(JSON.stringify({
      correct: false, confidence: 0.94, severity: "medium",
      error_type: "OUTDATED_INFORMATION",
      explanation: "The information came from documentation that is two versions behind.",
      recommended_action: "Prioritise current official documentation.",
    })),
  });
  const review = await good.review({
    question: "How do I set brightness in the Hue API?",
    answer: "Use the /bri endpoint.",
    sources: [{ url: "https://old.example/docs", kind: "community" }],
    tools: ["web_search"],
  });
  assert.strictEqual(review.available, true);
  assert.strictEqual(review.correct, false);
  assert.strictEqual(review.error_type, "OUTDATED_INFORMATION");
  assert.strictEqual(review.confidence, 0.94);
  assert.strictEqual(review.advisory, true, "a review is always advisory");
  ok("a review comes back as structured, advisory JSON");

  // The reviewer only ever sees finished work.
  assert.match(good.transport.lastPrompt.user, /THE ANSWER SHE ALREADY GAVE/);
  assert.match(good.transport.lastPrompt.system, /not talking to a user/);
  ok("the reviewer is shown an answer that was already given, never asked for one");

  // A model talking nonsense must not become a confident verdict.
  const garbage = new Evaluator({ transport: fakeTransport("I think it's probably fine?") });
  const unusable = await garbage.review({ question: "q", answer: "a" });
  assert.strictEqual(unusable.available, false);
  assert.match(unusable.reason, /not a review/);
  ok("a reviewer that returns prose instead of a verdict is discarded, not believed");

  const weird = new Evaluator({
    transport: fakeTransport(JSON.stringify({ correct: false, confidence: 7, severity: "catastrophic", error_type: "VIBES" })),
  });
  const cleaned = await weird.review({ question: "q", answer: "a" });
  assert.strictEqual(cleaned.confidence, 1, "confidence is clamped into range");
  assert.strictEqual(cleaned.severity, "medium", "an unknown severity falls back rather than passing through");
  assert.strictEqual(cleaned.error_type, "UNCLASSIFIED", "an invented error type is not added to the taxonomy");
  ok("out-of-range and invented values are normalised instead of trusted");

  // ---------------------------------------------- the human wins
  const store = new CaseStore({ file: path.join(tmp, "cases.json") });
  const opened = store.open({
    question: "What port does Home Assistant use?",
    answer: "Port 8321.",
    why: "low confidence",
    confidence: 0.3,
    conversation: "private chatter about the house",
    sources: [{ url: "https://forum.example", kind: "community" }],
  });
  store.attachEvaluation(opened.id, { available: true, correct: true, confidence: 0.8, error_type: null, explanation: "Looks right." });

  let outcome = store.outcome(opened.id);
  assert.strictEqual(outcome.correct, true);
  assert.match(outcome.authority, /advisory/, "an unconfirmed machine opinion must be labelled as such");

  store.decide(opened.id, { verdict: VERDICTS.INCORRECT, explanation: "It's 8123.", correctAnswer: "Port 8123." });
  outcome = store.outcome(opened.id);
  assert.strictEqual(outcome.correct, false, "the human verdict must win");
  assert.strictEqual(outcome.authority, "human");
  assert.strictEqual(outcome.correctAnswer, "Port 8123.");
  assert.strictEqual(store.get(opened.id).reviewerAgreed, false, "the disagreement is recorded");
  ok("a human verdict overrides the external reviewer outright");

  const reliability = store.reviewerReliability();
  assert.strictEqual(reliability.samples, 1);
  assert.strictEqual(reliability.agreementRate, 0);
  ok("how often the reviewer agreed with you is tracked, so it can be weighted");

  assert.throws(() => store.decide(opened.id, { verdict: "sure" }), /Unknown verdict/);
  ok("only the four defined verdicts are accepted");

  // ---------------------------------------------- privacy
  const full = applyPrivacy(store.get(opened.id), PRIVACY.FULL);
  assert.ok(full.conversation, "full scope includes the conversation");
  const relevant = applyPrivacy(store.get(opened.id), PRIVACY.RELEVANT);
  assert.strictEqual(relevant.conversation, undefined, "relevant scope drops the conversation");
  assert.ok(relevant.sources, "…but keeps the working material");
  const disputed = applyPrivacy(store.get(opened.id), PRIVACY.DISPUTED);
  assert.strictEqual(disputed.sources, undefined);
  assert.ok(disputed.question && disputed.answer);
  assert.strictEqual(applyPrivacy(store.get(opened.id), PRIVACY.NONE), null, "'do not send' must send nothing at all");
  ok("privacy scopes actually restrict what leaves the machine, including sending nothing");

  // Cases survive a restart.
  const reopened = new CaseStore({ file: path.join(tmp, "cases.json") });
  assert.strictEqual(reopened.get(opened.id).human.correctAnswer, "Port 8123.");
  ok("cases and their verdicts persist across a restart");

  // ---------------------------------------------- patterns, not facts
  const repeated = [
    { correct: false, error_type: "OUTDATED_INFORMATION", recommended_action: "Prefer current official docs." },
    { correct: false, error_type: "OUTDATED_INFORMATION", recommended_action: "Prefer current official docs." },
    { correct: false, error_type: "OUTDATED_INFORMATION", recommended_action: "Check the version before trusting a page." },
    { correct: false, error_type: "CODING_ERROR", recommended_action: "Run the tests." },
    { correct: true, error_type: null },
  ];
  const patterns = findPatterns(repeated);
  assert.strictEqual(patterns.length, 1, "only the repeated failure is a pattern");
  assert.strictEqual(patterns[0].errorType, "OUTDATED_INFORMATION");
  assert.strictEqual(patterns[0].occurrences, 3);
  assert.strictEqual(patterns[0].suggestions.length, 2, "distinct advice is collected");
  assert.match(patterns[0].lesson, /method problem/);
  ok("three mistakes of one kind become one lesson about method, not three facts");

  assert.ok(ERROR_TYPES.includes("INSUFFICIENT_RESEARCH") && ERROR_TYPES.length === 10);
  ok("the full mistake taxonomy is available for classification");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\neve/review: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
