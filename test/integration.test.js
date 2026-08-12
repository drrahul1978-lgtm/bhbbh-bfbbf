/* Everything at once: one full life cycle through every subsystem.
 *
 * The parts are tested individually elsewhere. This asks a different question —
 * do they work as one system? She boots, works out where she is, meets an API
 * she has never seen, writes and installs a skill for it, uses it, remembers
 * what happened, gets something wrong, is corrected, learns from it, and comes
 * back after a restart still knowing all of it.
 *
 * Run with:  node test/integration.test.js
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const kernel = require("../eve/kernel/index.js");
const platform = require("../eve/platform/detect.js");
const Discover = require("../discover.js");
const { SkillPipeline } = require("../eve/skills/pipeline.js");
const { SkillRegistry } = require("../eve/skills/registry.js");
const { Memory, TIER } = require("../eve/memory/store.js");
const { KnowledgeGraph } = require("../eve/memory/graph.js");
const { CaseStore, VERDICTS } = require("../eve/review/cases.js");
const { Evaluator, findPatterns } = require("../eve/review/evaluator.js");
const { RegressionSuite, LessonBook } = require("../eve/learn/regression.js");
const { CapabilityMap, LEVEL } = require("../eve/capabilities/map.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-integration-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };
const step = (name) => console.log(`\n── ${name} ──`);

/** A smart plug hub EVE has never met, which describes itself. */
const plugs = [
  { plugId: "p1", label: "Desk Lamp", power: "off" },
  { plugId: "p2", label: "Kettle", power: "off" },
];
const hub = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/openapi.json") {
    return res.end(JSON.stringify({
      openapi: "3.0.0",
      info: { title: "PlugHub", version: "1.0" },
      components: { securitySchemes: { b: { type: "http", scheme: "bearer" } } },
      paths: {
        "/plugs": { get: { summary: "List all plugs" } },
        "/plugs/{plugId}/on": { post: { summary: "Turn a plug on" } },
        "/plugs/{plugId}/off": { post: { summary: "Turn a plug off" } },
      },
    }));
  }
  if (req.url === "/plugs") return res.end(JSON.stringify(plugs));
  const m = req.url.match(/^\/plugs\/(\w+)\/(on|off)$/);
  if (m) {
    const plug = plugs.find((p) => p.plugId === m[1]);
    if (plug) plug.power = m[2];
    return res.end("{}");
  }
  res.writeHead(404).end("{}");
});

(async () => {
  await new Promise((r) => hub.listen(0, r));
  const hubUrl = `http://127.0.0.1:${hub.address().port}`;
  const dataDir = path.join(tmp, "eve-data");

  // ═══════════════════════════════════════════════ 1. she wakes up
  step("boot");
  const eve = kernel.boot({
    configFile: path.join(tmp, "none.json"),
    env: { EVE_SECRET_HUB_TOKEN: "hub-token-secret-value" },
    overrides: { dataDir, logFile: path.join(dataDir, "eve.log"), secretsFile: path.join(dataDir, "s.json"), logFlushMs: 200 },
    confirm: async () => true,          // a human is present and says yes
  });
  assert.ok(eve.platform.host, "she should know what she is running on");
  assert.ok(eve.config.trainingPreset, "and have adopted settings for it");
  assert.deepStrictEqual(eve.vault.names(), ["hub_token"]);
  console.log(`   ${eve.describe()}`);
  ok("boots, identifies the machine, tunes itself and loads its secrets");

  // ═══════════════════════════════════════════════ 2. short-term memory
  step("short-term memory");
  const memory = new Memory({ dir: path.join(dataDir, "memory"), saveEveryMs: 50 });
  memory.remember({ tier: TIER.SHORT_TERM, text: "user asked about the plug hub" });
  memory.remember({ tier: TIER.SHORT_TERM, text: "currently setting up a new integration" });
  assert.strictEqual(memory.stats().shortTerm, 2);
  assert.strictEqual(memory.stats().total, 0, "working notes are not long-term facts");
  ok("the current conversation is held separately from what she knows");

  // ═══════════════════════════════════════════════ 3. meets a new API
  step("discovery");
  const found = await Discover.discover({
    baseUrl: hubUrl, token: eve.vault.get("hub_token"),
    fetchImpl: globalThis.fetch, allowNetwork: false,
  });
  assert.strictEqual(found.tier, "openapi");
  assert.strictEqual(found.spec.name, "PlugHub");
  assert.ok(found.spec.actions.turn_on && found.spec.actions.turn_off);
  console.log(`   ${found.log.join("\n   ")}`);
  ok("an API she has never seen describes itself and she works out its shape");

  // ═══════════════════════════════════════════════ 4. writes her own skill
  step("skill creation");
  const registry = new SkillRegistry({ dir: path.join(dataDir, "skills"), log: eve.log, audit: eve.audit });
  const pipeline = new SkillPipeline({ kernel: eve, registry });
  const built = await pipeline.create(found.spec, {
    config: { token: eve.vault.get("hub_token") },
    allowedHosts: ["127.0.0.1"],
    why: "the user wants to control their plugs",
  });
  assert.strictEqual(built.ok, true, `pipeline failed: ${built.reason}`);
  assert.strictEqual(built.installed, true);
  console.log(`   stages: ${built.stages.map((s) => s.stage).join(" → ")}`);
  console.log(`   evidence: ${built.tested.evidence}`);
  ok("she writes an adapter, tests it in a separate process, verifies it and installs it");

  // Nothing reached VERIFIED without something actually being checked.
  const verified = eve.audit.all().filter((e) => e.state === "VERIFIED");
  assert.ok(verified.length >= 1);
  assert.ok(verified.every((e) => e.evidence), "a VERIFIED entry must carry its evidence");
  ok("the audit ledger records the install as verified, with evidence attached");

  // ═══════════════════════════════════════════════ 5. uses it for real
  step("using the skill");
  const Skills = require("../skills.js");
  const loaded = registry.loadCurrent(found.spec.id);
  assert.strictEqual(loaded.ok, true, "the installed source must match what was tested");
  const adapter = Skills.compile(loaded.source, { token: eve.vault.get("hub_token") }, globalThis.fetch, { allowedHosts: ["127.0.0.1"] });

  const things = await adapter.list();
  const lamp = things.find((t) => t.name === "Desk Lamp");
  const started = Date.now();
  await adapter.act("turn_on", lamp, null);
  registry.recordRun(found.spec.id, { ok: true, ms: Date.now() - started });
  assert.strictEqual(plugs[0].power, "on", "the actual device should have changed");
  ok("the skill she wrote turns on a real device, and the run is recorded");

  for (let i = 0; i < 34; i++) registry.recordRun(found.spec.id, { ok: i !== 7, ms: 40 + i });
  ok("thirty-five runs recorded, enough for a capability rating to mean something");

  // ═══════════════════════════════════════════════ 6. long-term memory + graph
  step("long-term memory");
  memory.remember({ text: "The plug hub is at " + hubUrl, source: "user_confirmed", subject: "plug hub address" });
  memory.remember({ text: "The Desk Lamp plug is p1 on the plug hub", source: "observed" });
  memory.rememberProcedure({
    task: "add the plug hub",
    steps: ["read /openapi.json", "generate adapter", "test in isolation", "install"],
    skill: found.spec.id, outcome: "succeeded", ms: 900,
  });

  const graph = new KnowledgeGraph({ file: path.join(dataDir, "graph.json") });
  graph.entity("plughub", { type: "skill", name: "PlugHub" });
  graph.entity("p1", { type: "device", name: "Desk Lamp" });
  graph.entity("office", { type: "room", name: "Office" });
  graph.link("plughub", "CONTROLS", "p1");
  graph.link("office", "CONTAINS", "p1");

  const recalled = memory.recall("where is the plug hub");
  assert.ok(recalled.length >= 1 && recalled[0].source === "user_confirmed");
  const procedure = memory.recallProcedure("add the plug hub");
  assert.strictEqual(procedure.length, 1);
  assert.strictEqual(graph.neighbours("p1", { rel: "IS_IN" })[0].node.name, "Office");
  ok("facts, procedures and relationships are stored and come back when asked for");

  // ═══════════════════════════════════════════════ 7. she gets something wrong
  step("a mistake, and being corrected");
  const cases = new CaseStore({ file: path.join(dataDir, "cases.json"), log: eve.log });
  const wrong = cases.open({
    question: "What is the plug hub's API version?",
    answer: "The plug hub runs API version 0.9.",
    why: "low confidence",
    sources: [{ url: "https://forum.example/thread", kind: "community" }],
    conversation: "private chatter that should not leave the house",
  });

  // The external reviewer looks at finished work only.
  const evaluator = new Evaluator({
    transport: {
      provider: "fake-reviewer",
      async complete(system, user) {
        assert.match(user, /THE ANSWER SHE ALREADY GAVE/, "the reviewer must only see finished work");
        return JSON.stringify({
          correct: false, confidence: 0.9, severity: "medium",
          error_type: "OUTDATED_INFORMATION",
          explanation: "That version came from an old forum thread.",
          recommended_action: "Read the API's own description before trusting a forum.",
        });
      },
    },
    log: eve.log,
  });
  const payload = cases.payloadFor(wrong.id, "relevant_conversation");
  assert.strictEqual(payload.conversation, undefined, "private conversation must not leave under this scope");
  const review = await evaluator.review(payload);
  cases.attachEvaluation(wrong.id, review);
  assert.strictEqual(review.advisory, true);
  ok("a doubtful answer becomes a case, reviewed advisorily, with privacy respected");

  cases.decide(wrong.id, {
    verdict: VERDICTS.INCORRECT,
    explanation: "It is 1.0 — it says so in /openapi.json.",
    correctAnswer: "The plug hub runs API version 1.0.",
  });
  const outcome = cases.outcome(wrong.id);
  assert.strictEqual(outcome.authority, "human");
  ok("your verdict settles it, outranking the external reviewer");

  // ═══════════════════════════════════════════════ 8. it becomes a test
  step("learning");
  const suite = new RegressionSuite({ file: path.join(dataDir, "regression.json"), log: eve.log });
  const made = suite.fromCase(cases.get(wrong.id), outcome);
  assert.strictEqual(made.created, true);
  assert.ok(made.test.mustContain.includes("1.0"));
  assert.ok(made.test.mustNotContain.includes("0.9"));

  const stillBroken = await suite.replay(async () => "The plug hub runs API version 0.9.");
  assert.strictEqual(stillBroken.summary.failed, 1);
  const nowFixed = await suite.replay(async () => "The plug hub runs API version 1.0.");
  assert.strictEqual(nowFixed.summary.passed, 1);
  ok("the correction becomes a regression test that fails before the fix and passes after");

  const book = new LessonBook({ file: path.join(dataDir, "lessons.json"), log: eve.log });
  const patterns = findPatterns([review, review, review]);
  const lesson = book.fromPattern(patterns[0]);
  assert.strictEqual(lesson.lesson.scope, "method");
  assert.match(lesson.lesson.lesson, /method problem/);
  ok("the same mistake three times becomes one change of method, not three facts");

  // ═══════════════════════════════════════════════ 9. the map reflects reality
  step("capability map");
  const map = new CapabilityMap({ registry, cases, suite, memory, platform: eve.platform, log: eve.log });
  console.log("   " + map.render().split("\n").join("\n   "));
  const integration = map.rate("api_integration");
  assert.ok(["moderate", "strong"].includes(integration.level), `expected a real rating, got ${integration.level}`);
  assert.ok(integration.samples >= 30, "the rating should rest on the runs actually recorded");
  assert.strictEqual(map.rate("self_modification").level, LEVEL.UNSUPPORTED, "what is not built reads as unsupported");
  ok("the capability map rates from real runs, and still admits what is not built");

  const gap = map.assess("connect to my new sprinkler api");
  assert.strictEqual(gap.canAcquire, true);
  ok("a new API is recognised as something she can learn, by the route she just used");

  // ═══════════════════════════════════════════════ 10. it survives a restart
  step("restart");
  memory.save();
  graph.save();
  eve.shutdown();

  const memoryAgain = new Memory({ dir: path.join(dataDir, "memory") });
  const graphAgain = new KnowledgeGraph({ file: path.join(dataDir, "graph.json") });
  const registryAgain = new SkillRegistry({ dir: path.join(dataDir, "skills") });
  const casesAgain = new CaseStore({ file: path.join(dataDir, "cases.json") });
  const suiteAgain = new RegressionSuite({ file: path.join(dataDir, "regression.json") });

  assert.ok(memoryAgain.recall("plug hub address").length >= 1, "facts survive");
  assert.strictEqual(memoryAgain.stats().shortTerm, 0, "working notes deliberately do not");
  assert.strictEqual(graphAgain.get("p1").name, "Desk Lamp", "the graph survives");
  assert.strictEqual(registryAgain.describe(found.spec.id).version, 1, "the installed skill survives");
  assert.strictEqual(casesAgain.outcome(wrong.id).authority, "human", "your verdict survives");
  assert.strictEqual(suiteAgain.list().length, 1, "the regression test survives");
  ok("after a restart she still has her skill, her memory, your correction and her tests");

  // The skill still works, from disk, after everything.
  const reloaded = registryAgain.loadCurrent(found.spec.id);
  assert.strictEqual(reloaded.ok, true, "and its source still matches what was tested");
  const adapterAgain = Skills.compile(reloaded.source, { token: "hub-token-secret-value" }, globalThis.fetch, { allowedHosts: ["127.0.0.1"] });
  await adapterAgain.act("turn_off", { id: "p1", name: "Desk Lamp", domain: "plughub" }, null);
  assert.strictEqual(plugs[0].power, "off", "and it still controls the device");
  ok("the skill written before the restart still controls the device after it");

  // ═══════════════════════════════════════════════ 11. no secrets anywhere
  step("secrets");
  const logText = fs.readFileSync(path.join(dataDir, "eve.log"), "utf8");
  assert.ok(!logText.includes("hub-token-secret-value"), "the token must never reach the log");
  const skillSource = fs.readFileSync(path.join(dataDir, "skills", found.spec.id, "v1.js"), "utf8");
  assert.ok(!skillSource.includes("hub-token-secret-value"), "nor the generated skill");
  const everyFile = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else everyFile.push(full);
    }
  })(dataDir);
  const leaked = everyFile.filter((f) => fs.readFileSync(f, "utf8").includes("hub-token-secret-value"));
  assert.deepStrictEqual(leaked, [], `the token leaked into: ${leaked.join(", ")}`);
  ok(`the token appears in none of the ${everyFile.length} files she wrote`);

  hub.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nintegration: ${passed} checks passed — every subsystem, one life cycle`);
})().catch((err) => { hub.close(); console.error(`\n✖ ${err.stack}`); process.exit(1); });
