/* End-to-end test of the Raspberry Pi path: runs eve-connect.js as a real
 * command against a fake Home Assistant, and checks she writes the adapter,
 * connects, understands plain English and actually changes a device.
 * Run with:  node test/connect.test.js  */
const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TOKEN = "pi-test-token";
const SKILL_FILE = path.join(ROOT, "eve-skills", "home_assistant.js");
const serviceCalls = [];

const entities = {
  "light.kitchen": { entity_id: "light.kitchen", state: "off", attributes: { friendly_name: "Kitchen Light" } },
  "switch.porch": { entity_id: "switch.porch", state: "on", attributes: { friendly_name: "Porch Light" } },
  "fan.bedroom": { entity_id: "fan.bedroom", state: "off", attributes: { friendly_name: "Bedroom Fan" } },
};

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end("{}");
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/config") return res.end(JSON.stringify({ location_name: "Pi House", version: "2026.8.0" }));
    if (req.url === "/api/states") return res.end(JSON.stringify(Object.values(entities)));
    if (req.url.startsWith("/api/states/")) {
      const id = decodeURIComponent(req.url.slice(12));
      return res.end(JSON.stringify(entities[id] || { entity_id: id, state: "unknown", attributes: {} }));
    }
    if (req.url.startsWith("/api/services/")) {
      const [, , , domain, service] = req.url.split("/");
      const payload = JSON.parse(body || "{}");
      serviceCalls.push({ domain, service, payload });
      const entity = entities[payload.entity_id];
      if (entity && service === "turn_on") entity.state = "on";
      if (entity && service === "turn_off") entity.state = "off";
      return res.end(JSON.stringify([]));
    }
    res.writeHead(404).end("{}");
  });
});

const run = (args, baseUrl) =>
  new Promise((resolve) => {
    execFile("node", [path.join(ROOT, "eve-connect.js"), "--url", baseUrl, "--token", TOKEN, ...args],
      { cwd: ROOT, timeout: 120000 },
      (err, stdout, stderr) => resolve({ err, stdout, stderr }));
  });

(async () => {
  // Start clean so the first run genuinely has to write the adapter.
  if (fs.existsSync(SKILL_FILE)) fs.unlinkSync(SKILL_FILE);

  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let passed = 0;
  const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

  // --- first run: she has no code for this API and has to write it ---
  const first = await run(["--list"], baseUrl);
  assert.ok(!first.err, `command failed: ${first.stderr}`);
  assert.match(first.stdout, /has no code for Home Assistant\. Writing an adapter/);
  assert.match(first.stdout, /Connected to Pi House 2026\.8\.0/);
  assert.match(first.stdout, /Kitchen Light/);
  assert.ok(fs.existsSync(SKILL_FILE), "she should have saved the adapter she wrote");
  ok("writes her own Home Assistant adapter on first contact, then connects and lists devices");

  const written = fs.readFileSync(SKILL_FILE, "utf8");
  assert.ok(!written.includes(TOKEN), "the saved adapter must not contain the token");
  assert.ok(written.includes("async function act("), "the saved adapter must be real code");
  ok("the code she saved is real, and holds no credentials");

  // --- second run: she reuses what she wrote ---
  const second = await run(["--list"], baseUrl);
  assert.match(second.stdout, /Using the adapter Eve wrote earlier/);
  ok("reuses her own code on later runs instead of rewriting it");

  // --- plain English actually changes a device ---
  serviceCalls.length = 0;
  const turnOn = await run(["turn on the kitchen light"], baseUrl);
  assert.match(turnOn.stdout, /Kitchen Light/);
  assert.strictEqual(serviceCalls.length, 1, "expected exactly one service call");
  assert.deepStrictEqual(
    { domain: serviceCalls[0].domain, service: serviceCalls[0].service, id: serviceCalls[0].payload.entity_id },
    { domain: "light", service: "turn_on", id: "light.kitchen" }
  );
  assert.strictEqual(entities["light.kitchen"].state, "on", "the light should now be on");
  ok('"turn on the kitchen light" turned on the kitchen light');

  serviceCalls.length = 0;
  await run(["switch off the porch light"], baseUrl);
  assert.strictEqual(serviceCalls[0].service, "turn_off");
  assert.strictEqual(serviceCalls[0].payload.entity_id, "switch.porch");
  ok('"switch off the porch light" — a phrasing she was never trained on — turned it off');

  // --- questions do not change anything ---
  serviceCalls.length = 0;
  const query = await run(["is the bedroom fan on"], baseUrl);
  assert.match(query.stdout, /Bedroom Fan is off/);
  assert.strictEqual(serviceCalls.length, 0, "a question must not call a service");
  ok("answers a question about state without touching the device");

  // --- and she admits when she does not understand ---
  serviceCalls.length = 0;
  const confused = await run(["banana helicopter tuesday"], baseUrl);
  assert.match(confused.stdout, /did not follow that/);
  assert.strictEqual(serviceCalls.length, 0, "nonsense must never trigger an action");
  ok("refuses to act on something she did not understand");

  const missing = await run(["turn on the spaceship"], baseUrl);
  assert.match(missing.stdout, /not which device/);
  ok("says so when the device is not on your system");

  server.close();
  console.log(`\neve-connect.js: ${passed} tests passed`);
})().catch((err) => {
  server.close();
  console.error(`\n✖ ${err.stack}`);
  process.exit(1);
});
