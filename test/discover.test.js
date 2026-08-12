/* Can Eve work out an API nobody described to her?
 *
 * Three fake services, none of which she has ever seen: one that publishes an
 * OpenAPI document, one that publishes nothing at all, and one that buries its
 * values in nested objects the way Google's device APIs do. In every case she
 * gets no spec — only a URL and a token — and has to produce a working adapter.
 * Run with:  node test/discover.test.js  */
const assert = require("assert");
const http = require("http");
const Skills = require("../skills.js");
const Discover = require("../discover.js");

const TOKEN = "discover-token";
const calls = [];

/** Service A: publishes an OpenAPI description of itself. */
const OPENAPI_DOC = {
  openapi: "3.0.0",
  info: { title: "Lumen Lighting", version: "2.1" },
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
  paths: {
    "/health": { get: { summary: "Health check" } },
    "/v1/fixtures": { get: { summary: "List all light fixtures", operationId: "listFixtures" } },
    "/v1/fixtures/{fixtureId}/on": { post: { summary: "Turn a fixture on" } },
    "/v1/fixtures/{fixtureId}/off": { post: { summary: "Turn a fixture off" } },
    "/v1/fixtures/{fixtureId}/brightness": { put: { summary: "Set fixture brightness level" } },
  },
};

const fixtures = [
  { fixtureId: "fx-1", label: "Hallway Spot", power: "off" },
  { fixtureId: "fx-2", label: "Reading Lamp", power: "on" },
  { fixtureId: "fx-3", label: "Porch Flood", power: "off" },
];

function makeServer(handler) {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ url: req.url, method: req.method, auth: req.headers.authorization, body: body || null });
      res.setHeader("Content-Type", "application/json");
      handler(req, res, body);
    });
  });
}

// Service A — self-describing.
const serverA = makeServer((req, res) => {
  if (req.url === "/openapi.json") return res.end(JSON.stringify(OPENAPI_DOC));
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end("{}");
  if (req.url === "/v1/fixtures") return res.end(JSON.stringify({ data: fixtures }));
  if (req.url === "/health") return res.end(JSON.stringify({ ok: true }));
  const m = req.url.match(/^\/v1\/fixtures\/([^/]+)\/(on|off)$/);
  if (m) {
    const f = fixtures.find((x) => x.fixtureId === m[1]);
    if (f) f.power = m[2] === "on" ? "on" : "off";
    return res.end("{}");
  }
  res.writeHead(404).end("{}");
});

// Service B — no description anywhere, plain array at a common path.
const gadgets = [
  { uuid: "g-100", title: "Garage Door", status: "closed" },
  { uuid: "g-101", title: "Attic Fan", status: "idle" },
];
const serverB = makeServer((req, res) => {
  if (req.url === "/devices") return res.end(JSON.stringify(gadgets));
  res.writeHead(404).end("{}");
});

// Service C — nested traits, the shape that defeated the old generator.
const nested = {
  devices: [
    { name: "enterprises/x/devices/AAA", type: "sdm.devices.types.THERMOSTAT",
      traits: { "sdm.devices.traits.Info": { customName: "Living Room Thermostat" }, "sdm.devices.traits.Connectivity": { status: "ONLINE" } } },
    { name: "enterprises/x/devices/BBB", type: "sdm.devices.types.CAMERA",
      traits: { "sdm.devices.traits.Info": { customName: "Front Camera" }, "sdm.devices.traits.Connectivity": { status: "OFFLINE" } } },
  ],
};
const serverC = makeServer((req, res) => {
  if (req.url === "/api/devices") return res.end(JSON.stringify(nested));
  res.writeHead(404).end("{}");
});

const listen = (server) => new Promise((r) => server.listen(0, () => r(`http://127.0.0.1:${server.address().port}`)));

(async () => {
  const [urlA, urlB, urlC] = await Promise.all([listen(serverA), listen(serverB), listen(serverC)]);
  let passed = 0;
  const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

  // --- Tier 1: the API describes itself ---
  const a = await Discover.discover({ baseUrl: urlA, token: TOKEN, fetchImpl: globalThis.fetch, allowNetwork: false });
  assert.strictEqual(a.tier, "openapi", `expected discovery via OpenAPI, got ${a.tier}: ${a.log.join(" | ")}`);
  assert.strictEqual(a.spec.name, "Lumen Lighting");
  assert.strictEqual(a.spec.listPath, "/v1/fixtures");
  assert.strictEqual(a.spec.itemsKey, "data");
  assert.deepStrictEqual(a.spec.idKey, ["fixtureId"]);
  assert.deepStrictEqual(a.spec.nameKey, ["label"]);
  assert.deepStrictEqual(a.spec.stateKey, ["power"]);
  assert.strictEqual(a.spec.auth.type, "bearer");
  ok("reads an API's own OpenAPI document and derives the whole spec unaided");

  assert.ok(a.spec.actions.turn_on, "should have found the turn-on endpoint");
  assert.strictEqual(a.spec.actions.turn_on.path, "/v1/fixtures/{id}/on");
  assert.strictEqual(a.spec.actions.turn_on.method, "POST");
  assert.strictEqual(a.spec.actions.turn_off.path, "/v1/fixtures/{id}/off");
  assert.strictEqual(a.spec.actions.set_level.method, "PUT");
  ok("works out which endpoints turn things on, off and set a level");

  // …and the adapter she writes from it actually drives the service.
  const adapterA = Skills.compile(Skills.generateAdapter(a.spec), { token: TOKEN }, globalThis.fetch);
  const thingsA = await adapterA.list();
  assert.strictEqual(thingsA.length, 3);
  assert.strictEqual(thingsA[0].name, "Hallway Spot");
  assert.strictEqual(thingsA[0].state, "off");

  calls.length = 0;
  await adapterA.act("turn_on", thingsA[0], null);
  assert.ok(calls.some((c) => c.url === "/v1/fixtures/fx-1/on" && c.method === "POST"), "should POST to the on endpoint");
  assert.strictEqual(fixtures[0].power, "on", "the fixture should actually be on now");
  const after = await adapterA.act("query_state", thingsA[0], null);
  assert.strictEqual(after.state, "on");
  ok("the adapter she wrote from that document controls the service for real");

  // --- Tier 2: nothing published, infer from the response ---
  const b = await Discover.discover({ baseUrl: urlB, fetchImpl: globalThis.fetch, allowNetwork: false, name: "Gadgets" });
  assert.strictEqual(b.tier, "inferred", `expected inference, got ${b.tier}: ${b.log.join(" | ")}`);
  assert.deepStrictEqual(b.spec.idKey, ["uuid"]);
  assert.deepStrictEqual(b.spec.nameKey, ["title"]);
  assert.deepStrictEqual(b.spec.stateKey, ["status"]);
  assert.ok(b.unknown.includes("actions"), "she should admit she does not know how to act on these");
  const adapterB = Skills.compile(Skills.generateAdapter(b.spec), {}, globalThis.fetch);
  const thingsB = await adapterB.list();
  assert.deepStrictEqual(thingsB.map((t) => t.name), ["Garage Door", "Attic Fan"]);
  ok("with no published description, infers id/name/state from the actual response");

  // --- Nested values, the Google-shaped case ---
  const c = await Discover.discover({ baseUrl: urlC, fetchImpl: globalThis.fetch, allowNetwork: false, name: "Nest-like" });
  assert.strictEqual(c.spec.itemsKey, "devices");
  // The middle segment contains dots of its own — which is exactly why paths
  // are arrays of keys rather than a dotted string.
  assert.deepStrictEqual(c.spec.nameKey, ["traits", "sdm.devices.traits.Info", "customName"],
    `expected the nested display name, got ${JSON.stringify(c.spec.nameKey)}`);
  const adapterC = Skills.compile(Skills.generateAdapter(c.spec), {}, globalThis.fetch);
  const thingsC = await adapterC.list();
  assert.deepStrictEqual(thingsC.map((t) => t.name), ["Living Room Thermostat", "Front Camera"]);
  ok("digs values out of nested objects — the shape that used to be impossible");

  // --- Honest about what it could not work out ---
  const empty = Discover.inferFromSample({ message: "hello" }, { baseUrl: urlB, listPath: "/" });
  assert.strictEqual(empty.ok, false);
  assert.ok(empty.reason.includes("does not look like a list"));
  ok("says what it could not work out instead of inventing a spec");

  // --- Offline is a state, not a crash ---
  const offline = await Discover.discover({
    baseUrl: "http://127.0.0.1:9", fetchImpl: globalThis.fetch, allowNetwork: false, timeoutMs: 400,
  });
  assert.strictEqual(offline.tier, "offline");
  assert.strictEqual(offline.spec, null);
  assert.ok(offline.log.some((l) => l.includes("offline")), "the log should explain why it stopped");
  ok("running with no network gives a clear offline result, not an error");

  // --- A cached description works with no network at all ---
  const cachedRun = await Discover.discover({
    baseUrl: urlA, fetchImpl: () => { throw new Error("network is down"); },
    cached: a.spec, allowNetwork: false,
  });
  assert.strictEqual(cachedRun.tier, "cache");
  assert.strictEqual(cachedRun.spec.listPath, "/v1/fixtures");
  ok("uses what she learned earlier when there is no connection at all");

  serverA.close(); serverB.close(); serverC.close();
  console.log(`\ndiscover.js: ${passed} tests passed`);
})().catch((err) => {
  serverA.close(); serverB.close(); serverC.close();
  console.error(`\n✖ ${err.stack}`);
  process.exit(1);
});
