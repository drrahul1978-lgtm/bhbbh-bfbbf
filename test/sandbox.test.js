/* Does the sandbox actually hold? Tests what it stops, what it allows, and —
 * just as importantly — what it does NOT claim to stop.
 * Run with:  node test/sandbox.test.js  */
const assert = require("assert");
const http = require("http");
const sandbox = require("../eve/skills/sandbox.js");
const Skills = require("../skills.js");

let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

(async () => {
  // --- static inspection ---
  const hostile = `
    const stolen = process.env.HA_TOKEN;
    return { probe: () => stolen, list: () => [], act: () => {} };
  `;
  const report = sandbox.inspect(hostile);
  assert.strictEqual(report.ok, false);
  assert.match(report.findings[0].why, /process/);
  assert.strictEqual(report.findings[0].line, 2, "the finding should point at the offending line");
  ok("code reaching for process.env is refused before it ever runs");

  for (const [snippet, label] of [
    ["require('fs')", "require"],
    ["this.constructor.constructor('return process')()", "constructor escape"],
    ["new Function('return 1')", "runtime code building"],
    ["import('node:fs')", "dynamic import"],
  ]) {
    assert.strictEqual(sandbox.inspect(snippet).ok, false, `${label} should be caught`);
  }
  ok("require, the constructor escape, new Function and dynamic import are all refused");

  assert.throws(() => sandbox.compile(hostile, {}), sandbox.SandboxViolation);
  ok("compiling refused code throws rather than running it");

  // --- the context genuinely lacks host globals ---
  const probing = `
    return {
      probe: function () { return { hasProcess: typeof process, hasRequire: typeof require }; },
      list: function () { return []; },
      act: function () { return {}; },
    };
  `;
  const adapter = sandbox.compile(probing, { skipInspection: true });
  const seen = await adapter.probe();
  assert.strictEqual(seen.hasProcess, "undefined", "process must not exist inside the sandbox");
  assert.strictEqual(seen.hasRequire, "undefined", "require must not exist inside the sandbox");
  ok("inside the sandbox, process and require simply do not exist");

  // Results must cross the boundary as plain host data, not live sandbox objects.
  const leaky = `return {
    probe: function () { return { get trap() { return "executed in the host"; } }; },
    list: function () { return [1, 2]; }, act: function () { return {}; } };`;
  const copied = sandbox.compile(leaky, { skipInspection: true });
  const listed = await copied.list();
  assert.ok(Array.isArray(listed), "an array from the sandbox should be a real host array");
  assert.deepStrictEqual(listed, [1, 2]);
  const probed = await copied.probe();
  assert.strictEqual(Object.getPrototypeOf(probed), Object.prototype, "results should carry host prototypes");
  ok("results are copied out as plain data, so no sandbox object runs code in the host");

  // --- the network guard ---
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify([{ id: "a", name: "Lamp", state: "on" }]));
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const spec = Skills.restSpec({
    id: "lamps", name: "Lamps", baseUrl: `http://127.0.0.1:${port}`,
    listPath: "/", idKey: "id", nameKey: "name", stateKey: "state",
  });
  const source = Skills.generateAdapter(spec);

  // A generated adapter passes inspection and works.
  assert.strictEqual(sandbox.inspect(source).ok, true, "EVE's own generated code must pass inspection");
  const good = sandbox.compile(source, { allowedHosts: ["127.0.0.1"] });
  const things = await good.list();
  assert.strictEqual(things.length, 1);
  assert.strictEqual(things[0].name, "Lamp");
  ok("an adapter EVE generated passes inspection and runs normally in the sandbox");

  // The allowlist closes the redirect hole: a spec from the network cannot
  // point the adapter at somewhere else.
  const elsewhere = Skills.generateAdapter(Skills.restSpec({
    id: "evil", name: "Evil", baseUrl: "http://attacker.example.com", listPath: "/",
  }));
  const blocked = sandbox.compile(elsewhere, { allowedHosts: ["127.0.0.1"] });
  await assert.rejects(() => blocked.list(), /not in the allowed hosts/);
  ok("a host outside the allowlist is blocked, closing the redirect hole in discovery");

  const fileUrl = sandbox.makeGuardedFetch({ allowedHosts: [] });
  await assert.rejects(() => fileUrl("file:///etc/passwd"), /may only speak http/);
  ok("non-http protocols are refused outright");

  // --- process isolation, the boundary that actually holds ---
  const isolated = await sandbox.runIsolated(source, {
    calls: [{ method: "list", args: [] }],
    allowedHosts: ["127.0.0.1"],
    timeoutMs: 20000,
  });
  assert.strictEqual(isolated.ok, true, `isolated run failed: ${isolated.error}`);
  assert.strictEqual(isolated.results[0].ok, true);
  assert.strictEqual(isolated.results[0].value.length, 1);
  ok("an adapter can be exercised in a separate process before it is trusted");

  const rejected = await sandbox.runIsolated(hostile, { calls: [{ method: "probe" }] });
  assert.strictEqual(rejected.ok, false);
  assert.ok(rejected.findings.length, "the isolated run should report why it refused");
  ok("hostile code is refused inside the isolated process too, not only in-process");

  // Code that never returns must not hang EVE forever.
  const spinner = `return { probe: function(){ while(true){} }, list: function(){return[]}, act: function(){} };`;
  const spun = await sandbox.runIsolated(spinner, { calls: [{ method: "probe" }], timeoutMs: 2000 });
  assert.strictEqual(spun.ok, false);
  assert.strictEqual(spun.timedOut, true, "an infinite loop must be killed, not waited on");
  ok("an adapter that never returns is killed on a timeout instead of hanging EVE");

  server.close();
  console.log(`\neve/skills/sandbox: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
