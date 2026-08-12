/* The registry and the pipeline: can a skill only be installed once it has
 * proved itself, is the last good version always recoverable, and does a
 * replacement have to earn its place?
 * Run with:  node test/registry.test.js  */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const { SkillRegistry, STATE } = require("../eve/skills/registry.js");
const { SkillPipeline } = require("../eve/skills/pipeline.js");
const Skills = require("../skills.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-registry-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

const SOURCE_V1 = `return { probe: async () => ({ok:true}), list: async () => [{id:"a",name:"A"}], act: async () => ({done:"x"}) };`;
const SOURCE_V2 = SOURCE_V1.replace("[{id:\"a\",name:\"A\"}]", "[{id:\"a\",name:\"A\"},{id:\"b\",name:\"B\"}]");

(async () => {
  const registry = new SkillRegistry({ dir: path.join(tmp, "skills") });

  // --- versioning ---
  const v1 = registry.register("lamps", { name: "Lamps", source: SOURCE_V1, permissions: ["NETWORK_ACCESS"] });
  const v2 = registry.register("lamps", { name: "Lamps", source: SOURCE_V2 });
  assert.strictEqual(v1.version, 1);
  assert.strictEqual(v2.version, 2, "registering again makes a new version, never an overwrite");
  assert.ok(fs.existsSync(path.join(tmp, "skills", "lamps", "v1.js")), "the old source stays on disk");
  ok("each registration is a new version and earlier sources are kept");

  // --- an untested skill cannot go into service ---
  assert.throws(() => registry.install("lamps", 1), /not tested/);
  ok("a skill that has never been tested cannot be installed");

  registry.recordTest("lamps", 1, { passed: true, isolated: true, evidence: "listed 1 thing" });
  registry.install("lamps", 1);
  assert.strictEqual(registry.describe("lamps").version, 1);
  assert.strictEqual(registry.describe("lamps").state, STATE.INSTALLED);
  ok("a tested skill installs and reports itself as in service");

  registry.recordTest("lamps", 2, { passed: false, error: "the hub refused the request" });
  assert.throws(() => registry.install("lamps", 2), /not tested/);
  assert.strictEqual(registry.describe("lamps").version, 1, "the working version must stay in service");
  ok("a version that failed its test cannot displace a working one");

  // --- rollback keeps the old version alive ---
  registry.recordTest("lamps", 2, { passed: true, evidence: "listed 2 things" });
  registry.install("lamps", 2);
  assert.strictEqual(registry.describe("lamps").version, 2);
  assert.strictEqual(registry.history("lamps").find((v) => v.version === 1).state, STATE.SUPERSEDED,
    "the replaced version is superseded, not deleted");
  assert.ok(fs.existsSync(path.join(tmp, "skills", "lamps", "v1.js")), "and its source is still there");

  const rolled = registry.rollback("lamps", { reason: "it started timing out" });
  assert.strictEqual(rolled.to, 1);
  assert.strictEqual(registry.describe("lamps").version, 1);
  assert.strictEqual(registry.history("lamps").find((v) => v.version === 2).rollbackReason, "it started timing out");
  ok("rollback returns to the previous version and records why");

  assert.throws(() => registry.rollback("lamps"), /nothing to roll back to/);
  ok("rolling back with nowhere to go says so rather than breaking the skill");

  // --- integrity ---
  const loaded = registry.loadCurrent("lamps");
  assert.strictEqual(loaded.ok, true);
  assert.strictEqual(loaded.version, 1);
  fs.writeFileSync(path.join(tmp, "skills", "lamps", "v1.js"), SOURCE_V1 + "\n// tampered");
  const damaged = registry.loadCurrent("lamps");
  assert.strictEqual(damaged.ok, false);
  assert.match(damaged.reason, /does not match what was tested/);
  ok("a skill whose file no longer matches what was tested is refused, not run");

  // --- performance data ---
  const perf = new SkillRegistry({ dir: path.join(tmp, "skills") });
  perf.register("hub", { name: "Hub", source: SOURCE_V1 });
  perf.recordTest("hub", 1, { passed: true });
  perf.install("hub", 1);
  for (let i = 0; i < 8; i++) perf.recordRun("hub", { ok: i < 6, ms: 100 + i, error: i >= 6 ? "timeout" : null });
  perf.recordRun("hub", { ok: true, ms: 120, corrected: true });

  const stats = perf.stats("hub", 1);
  assert.strictEqual(stats.runs, 9);
  assert.ok(Math.abs(stats.successRate - 7 / 9) < 1e-9);
  assert.ok(Math.abs(stats.errorRate - 2 / 9) < 1e-9);
  assert.ok(Math.abs(stats.correctionRate - 1 / 9) < 1e-9);
  assert.strictEqual(stats.lastError, "timeout");
  assert.ok(stats.averageMs > 100);
  ok("success, error and correction rates come from real recorded runs");

  const described = perf.describe("hub");
  for (const field of ["name", "version", "dependencies", "permissions", "successRate", "errorRate", "averageMs", "lastUpdated", "knownIssues"]) {
    assert.ok(field in described, `describe() should report ${field}`);
  }
  ok("a skill reports everything the brief asks for: version, deps, permissions, rates, timing, issues");

  // --- a replacement must earn its place ---
  perf.register("hub", { name: "Hub", source: SOURCE_V2 });
  perf.recordTest("hub", 2, { passed: true });

  let verdict = perf.compare("hub", 1, 2);
  assert.strictEqual(verdict.decision, "insufficient_evidence", "two runs are not evidence");
  ok("a comparison on too few runs refuses to decide rather than guessing");

  for (let i = 0; i < 25; i++) perf.recordRun("hub", { version: 2, ok: true, ms: 95 });
  for (let i = 0; i < 20; i++) perf.recordRun("hub", { version: 1, ok: i < 15, ms: 100 });
  verdict = perf.compare("hub", 1, 2);
  assert.strictEqual(verdict.decision, "adopt");
  assert.match(verdict.why, /succeeds/);
  ok("a version that genuinely succeeds more often is adopted");

  perf.register("hub", { name: "Hub", source: SOURCE_V1 });
  for (let i = 0; i < 25; i++) perf.recordRun("hub", { version: 3, ok: true, ms: 300 });
  const noGain = perf.compare("hub", 2, 3);
  assert.strictEqual(noGain.decision, "keep_current");
  assert.match(noGain.why, /newer is not a reason/);
  ok("a newer version that is no better is kept out — newer is not a reason");

  // --- the whole pipeline, against a real service ---
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/things") return res.end(JSON.stringify([{ id: "t1", label: "Kettle", status: "off" }]));
    res.end("[]");
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const pipeline = new SkillPipeline({ dir: path.join(tmp, "pipeline") });
  const spec = Skills.restSpec({
    id: "kettles", name: "Kettles", baseUrl: `http://127.0.0.1:${port}`,
    listPath: "/things", idKey: "id", nameKey: "label", stateKey: "status",
  });
  const created = await pipeline.create(spec, { allowedHosts: ["127.0.0.1"] });
  assert.strictEqual(created.ok, true, `pipeline failed: ${created.reason}`);
  assert.strictEqual(created.installed, true);
  assert.deepStrictEqual(created.stages.map((s) => s.stage), ["generate", "inspect", "register", "test", "verify", "install"]);
  assert.match(created.tested.evidence, /listed 1 thing/);
  ok("the full pipeline generates, inspects, tests in isolation, verifies and installs");

  // Connecting but finding nothing is not a working integration.
  const emptySpec = Skills.restSpec({
    id: "empties", name: "Empties", baseUrl: `http://127.0.0.1:${port}`, listPath: "/nothing",
  });
  const empty = await pipeline.create(emptySpec, { allowedHosts: ["127.0.0.1"] });
  assert.strictEqual(empty.ok, false);
  assert.match(empty.reason, /found nothing/);
  assert.strictEqual(pipeline.registry.describe("empties").version, null, "nothing should be in service");
  ok("an adapter that connects but finds nothing is not installed");

  // A service that is not there fails at the test stage, not silently.
  const deadSpec = Skills.restSpec({ id: "dead", name: "Dead", baseUrl: "http://127.0.0.1:1", listPath: "/" });
  const dead = await pipeline.create(deadSpec, { allowedHosts: ["127.0.0.1"] });
  assert.strictEqual(dead.ok, false);
  assert.ok(dead.stages.find((s) => s.stage === "test" && !s.ok), "the test stage should be the one that stopped it");
  assert.strictEqual(pipeline.registry.history("dead").find((v) => v.version === 1).state, STATE.FAILED);
  ok("an unreachable service stops at the test stage and is recorded as failed");

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\neve/skills/registry: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
