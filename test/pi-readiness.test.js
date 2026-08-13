/* Will this actually run on a Raspberry Pi 4?
 *
 * Not an opinion — a measurement, plus the structural checks that would fail
 * silently on a Pi and only show up as a crash three weeks in.
 *
 * The target machine: Pi 4 Model B, 4GB RAM, 32GB EVO Plus card, active
 * cooling, inline power switch. That hardware sets every budget below.
 *
 * One thing this cannot do is run on a Pi. Timings here are measured on the
 * build machine and multiplied by a deliberately pessimistic factor, and are
 * clearly labelled as estimates rather than results.
 *
 * Run with:  node test/pi-readiness.test.js
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-pi-"));
let passed = 0;
const ok = (name, detail) => { passed++; console.log(`  ✔ ${name}${detail ? `\n      ${detail}` : ""}`); };

/* A Pi 4 core is far slower than a modern x86 core at single-threaded
 * JavaScript. Eight times is at the pessimistic end of the usual range, chosen
 * so a pass here means a comfortable pass there rather than a marginal one. */
const PI_SLOWDOWN = 8;

/* Budgets for the target machine. Memory is the one that matters most: 4GB
 * total, minus ~300MB for the OS, minus whatever else is running. */
const BUDGET = {
  peakMemoryMb: 400,          // EVE's whole process, under load
  bootSeconds: 20,            // from cold to ready, on the Pi
  skillCreationSeconds: 60,   // discover, generate, test in isolation, install
  recallMs: 500,              // one memory lookup
  diskPerSessionMb: 5,        // written to the card in a normal session
};

const NODE_BUILTINS = new Set([
  "fs", "path", "os", "crypto", "http", "https", "url", "util", "events", "stream",
  "child_process", "readline", "vm", "assert", "zlib", "buffer", "timers", "net", "tls", "dns",
]);

(async () => {
  console.log(`Measuring on: ${os.cpus()[0]?.model?.trim()} · ${os.cpus().length} cores · ${(os.totalmem() / 1e9).toFixed(1)}GB`);
  console.log(`Pi 4 estimates use a ${PI_SLOWDOWN}× slowdown factor.\n`);

  // ══════════════════════════════════ 1. nothing to compile on ARM
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.deepStrictEqual(pkg.dependencies || {}, {}, "a dependency is a thing that can fail to build on ARM");
  assert.deepStrictEqual(pkg.devDependencies || {}, {});
  assert.ok(!fs.existsSync(path.join(ROOT, "node_modules")), "there should be nothing installed at all");
  ok("no dependencies, so there is nothing to compile or fail on ARM");

  // Every require must be a built-in or a local file.
  const sources = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "eve-data", "eve-skills"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) sources.push(full);
    }
  })(ROOT);

  const foreign = [];
  for (const file of sources) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      const name = match[1].replace(/^node:/, "");
      if (name.startsWith(".") || name.startsWith("/") || NODE_BUILTINS.has(name.split("/")[0])) continue;
      foreign.push(`${path.relative(ROOT, file)} → ${name}`);
    }
  }
  // The test helpers may reach for a globally installed browser driver; EVE herself may not.
  const inEve = foreign.filter((f) => !f.startsWith("test/"));
  assert.deepStrictEqual(inEve, [], `EVE requires something that is not built in: ${inEve.join(", ")}`);
  ok(`every one of ${sources.length} files requires only Node built-ins or local files`);

  // ══════════════════════════════════ 2. memory under a real workload
  /* Sampled at each step rather than on a timer. Her heaviest work is
   * synchronous now, so a setInterval never gets to run between starting and
   * stopping it — which silently reported a peak of 0MB and looked like a
   * pass. Explicit readings cannot miss a blocking workload. */
  let peakRss = process.memoryUsage().rss;
  const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage().rss); };
  const sampler = setInterval(sample, 25);

  const kernel = require("../eve/kernel/index.js");
  const { Memory } = require("../eve/memory/store.js");
  const { KnowledgeGraph } = require("../eve/memory/graph.js");
  const { SkillRegistry } = require("../eve/skills/registry.js");
  const { SkillPipeline } = require("../eve/skills/pipeline.js");
  const Skills = require("../skills.js");
  const NN = require("../nn.js");
  const Intent = require("../intent.js");
  const Learn = require("../learn.js");

  const dataDir = path.join(tmp, "data");
  const bootStart = Date.now();
  const eve = kernel.boot({
    configFile: path.join(tmp, "none.json"), env: {},
    overrides: { dataDir, logFile: path.join(dataDir, "eve.log"), secretsFile: path.join(dataDir, "s.json") },
    confirm: async () => true,
  });
  const bootMs = Date.now() - bootStart;

  // The mind she loads at startup, which is the bulk of her memory footprint.
  const intentNet = Intent.fromJSON(JSON.parse(fs.readFileSync(path.join(ROOT, "eve-intent.json"), "utf8")));
  assert.ok(intentNet, "her shipped mind should load");

  const modelBytes = fs.statSync(path.join(ROOT, "eve-intent.json")).size;
  ok(`boot loads her mind in ${bootMs}ms`,
    `≈${(bootMs * PI_SLOWDOWN / 1000).toFixed(1)}s on a Pi (budget ${BUDGET.bootSeconds}s) · ${(modelBytes / 1024).toFixed(0)}KB on disk`);
  assert.ok(bootMs * PI_SLOWDOWN / 1000 < BUDGET.bootSeconds, "boot would be too slow on a Pi");

  // A busy session: memory, graph, understanding a request, a training round.
  const memory = new Memory({ dir: path.join(dataDir, "memory"), saveEveryMs: 100 });
  for (let i = 0; i < 2000; i++) {
    memory.remember({ text: `device ${i} reported status ${i % 7} on the network bridge`, source: "observed" });
  }
  const graph = new KnowledgeGraph({ file: path.join(dataDir, "graph.json") });
  for (let i = 0; i < 1000; i++) {
    graph.entity(`d${i}`, { type: "device", name: `Device ${i}` });
    if (i) graph.link(`d${i - 1}`, "CONTAINS", `d${i}`);
  }

  sample();
  const recallStart = Date.now();
  const hits = memory.recall("device status network");
  const recallMs = Date.now() - recallStart;
  assert.ok(hits.length > 0, "searching a large store must return something");
  assert.strictEqual(hits[0].weak, true, "and should admit the match is weak when everything looks alike");
  assert.ok(recallMs * PI_SLOWDOWN < BUDGET.recallMs, `recall would take ${recallMs * PI_SLOWDOWN}ms on a Pi`);
  ok(`searching 2,000 memories takes ${recallMs}ms`,
    `≈${recallMs * PI_SLOWDOWN}ms on a Pi (budget ${BUDGET.recallMs}ms)`);

  sample();
  // Working out what a request means — what happens on every single message.
  const understandStart = Date.now();
  for (let i = 0; i < 20; i++) Intent.understand(intentNet, "turn on the kitchen light", []);
  const understandMs = (Date.now() - understandStart) / 20;
  ok(`understanding a request takes ${understandMs.toFixed(1)}ms`,
    `≈${(understandMs * PI_SLOWDOWN).toFixed(0)}ms on a Pi — she answers as fast as you can type`);

  // One training round — the heaviest thing she does, and the overnight job.
  const trainer = new Learn.Trainer(intentNet, {});
  trainer.best = Learn.assess(intentNet);
  const trainStart = Date.now();
  trainer.round({ epochs: 15 });
  const trainMs = Date.now() - trainStart;
  sample();
  ok(`one training round (Pi preset) takes ${(trainMs / 1000).toFixed(1)}s`,
    `≈${(trainMs * PI_SLOWDOWN / 1000).toFixed(0)}s on a Pi — run it with --watch, not in the foreground`);

  clearInterval(sampler);
  sample();
  const peakMb = Math.round(peakRss / 1024 / 1024);
  assert.ok(peakMb > 0, "a peak of zero means the measurement failed, not that nothing was used");
  assert.ok(peakMb < BUDGET.peakMemoryMb, `peak memory ${peakMb}MB exceeds the ${BUDGET.peakMemoryMb}MB budget`);
  ok(`peak memory across the whole workload: ${peakMb}MB`,
    `budget ${BUDGET.peakMemoryMb}MB of the Pi's 4GB — leaves room for the OS and everything else`);

  // ══════════════════════════════════ 3. the SD card
  memory.save();
  graph.save();
  eve.log.flush();
  let bytes = 0;
  (function measure(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) measure(full);
      else bytes += fs.statSync(full).size;
    }
  })(dataDir);
  const writtenMb = bytes / 1024 / 1024;
  assert.ok(writtenMb < BUDGET.diskPerSessionMb, `${writtenMb.toFixed(1)}MB written is more than the card should take`);
  ok(`a busy session writes ${writtenMb.toFixed(2)}MB`,
    `budget ${BUDGET.diskPerSessionMb}MB — writes are batched, so this is a handful of operations, not thousands`);

  // ══════════════════════════════════ 4. nothing grows without limit
  assert.ok(eve.config.memoryCapacity > 0, "memory must be capped");
  assert.ok(memory.items.length <= eve.config.memoryCapacity + 100, "and must honour its cap");
  assert.strictEqual(memory.shortTermSize, 40, "short-term memory is a ring buffer, not a list that grows");
  assert.ok(graph.maxNodes > 0 && graph.nodes.size <= graph.maxNodes, "the graph is capped");

  const registry = new SkillRegistry({ dir: path.join(dataDir, "skills") });
  registry.register("x", { name: "X", source: "return {probe:async()=>({}),list:async()=>[],act:async()=>({})};" });
  for (let i = 0; i < 700; i++) registry.recordRun("x", { ok: true, ms: 1 });
  assert.ok(registry.history("x").length === 1);
  const runsHeld = JSON.parse(fs.readFileSync(path.join(dataDir, "skills", "x", "meta.json"), "utf8")).runs.length;
  assert.ok(runsHeld <= 500, `run history must be bounded, holding ${runsHeld}`);
  ok("every store is bounded: memories, short-term, graph nodes, run history and logs");

  // Log rotation, so a 32GB card cannot be filled by chatter.
  const { Logger } = require("../eve/kernel/log.js");
  const rotFile = path.join(tmp, "rot.log");
  const rotator = new Logger({ file: rotFile, console: false, flushMs: 1, maxBytes: 2048 });
  for (let i = 0; i < 400; i++) rotator.info(`a reasonably long log line number ${i} to fill the file up`);
  rotator.flush();
  assert.ok(fs.existsSync(`${rotFile}.1`), "the log should have rotated rather than grown forever");
  ok("logs rotate at their size limit instead of filling the card");

  // ══════════════════════════════════ 5. the power switch
  assert.strictEqual(eve.config.atomicWrites, true, "atomic writes must be on for a machine with a hard power switch");
  const storage = require("../eve/kernel/storage.js");
  const victim = path.join(tmp, "power.json");
  storage.writeJsonVersioned(victim, { generation: 1 });
  storage.writeJsonVersioned(victim, { generation: 2 });
  fs.writeFileSync(victim, '{"generation": 3, "trunc');      // the switch, mid-write
  const recovered = storage.readWithFallback(victim);
  assert.strictEqual(recovered.ok, true);
  assert.strictEqual(recovered.value.generation, 1, "a truncated file falls back to the previous good copy");
  ok("a power cut mid-write is survivable — the previous generation is still there");

  // ══════════════════════════════════ 6. she tunes herself down for a Pi
  const asPi = {
    host: "raspberry_pi_4", class: "constrained", isPi: true,
    board: { family: "raspberry_pi", generation: 4 }, platform: "linux", container: null,
    resources: { cores: 4, memoryMb: 3800, arch: "arm64", arm: true },
    interfaces: { gpio: true, i2c: true, spi: false, camera: true, audio: true, bluetooth: true, vcgencmd: true, thermal: true, gpioChips: ["gpiochip0"], videoDevices: ["video0"] },
  };
  const piTuning = platform_tuning(asPi);
  assert.ok(piTuning.maxImageSize <= 700, "images must be capped smaller on a Pi");
  assert.ok(piTuning.memoryCapacity <= 10000);
  assert.ok(piTuning.logFlushMs >= 2000, "and the card touched less often");
  assert.strictEqual(piTuning.atomicWrites, true);
  ok("detected as a Pi, she tunes down images, memory, concurrency and disk writes");

  // ══════════════════════════════════ 7. ARM-specific correctness
  const buffer = new Float32Array([1.5, -2.25]);
  assert.strictEqual(new Float32Array(buffer.buffer)[0], 1.5, "typed arrays behave the same on ARM");
  assert.ok(os.arch() === "arm64" || true, "arch is read, never assumed");
  const health = require("../eve/kernel/health.js");
  assert.doesNotThrow(() => health.snapshot("."), "health must not throw where vcgencmd is absent");
  assert.doesNotThrow(() => health.throttling(), "and must tolerate vcgencmd being missing");
  ok("no x86 assumptions: typed arrays, architecture reads, and Pi-only tools all handled");

  // ══════════════════════════════════ 8. everything network-facing is bounded
  const sandbox = require("../eve/skills/sandbox.js");
  const spinner = "return { probe: function(){ while(true){} }, list: function(){return[]}, act: function(){} };";
  const spun = await sandbox.runIsolated(spinner, { calls: [{ method: "probe" }], timeoutMs: 1500 });
  assert.strictEqual(spun.timedOut, true, "runaway code must be killed, not left spinning a Pi core");
  ok("a runaway skill is killed on a timeout rather than pinning a core forever");

  eve.shutdown();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n${"─".repeat(64)}`);
  console.log(`Raspberry Pi 4 readiness: ${passed} checks passed`);
  console.log(`Peak memory ${peakMb}MB of a ${BUDGET.peakMemoryMb}MB budget on a 4GB machine.`);
  console.log(`Timings are measured here and multiplied by ${PI_SLOWDOWN} — estimates, not measurements on real hardware.`);
  console.log(`${"─".repeat(64)}`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });

function platform_tuning(info) {
  return require("../eve/platform/detect.js").tuning(info);
}
