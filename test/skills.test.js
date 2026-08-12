/* Proves the adapter Eve writes actually works, by standing up a fake Home
 * Assistant and checking that her generated code speaks the real protocol:
 * right paths, right method, right JSON body, right auth header.
 * Run with:  node test/skills.test.js  */
const assert = require("assert");
const http = require("http");
const Skills = require("../skills.js");

const TOKEN = "test-token-abc123";
const received = [];

/** A stand-in for Home Assistant that records what it was asked. */
function startFakeHA() {
  const entities = {
    "light.kitchen": { entity_id: "light.kitchen", state: "off", attributes: { friendly_name: "Kitchen Light", brightness: 0 } },
    "switch.coffee": { entity_id: "switch.coffee", state: "on", attributes: { friendly_name: "Coffee Machine" } },
    "climate.hall": { entity_id: "climate.hall", state: "heat", attributes: { friendly_name: "Hall Thermostat", temperature: 19 } },
    "sensor.outside": { entity_id: "sensor.outside", state: "11.4", attributes: { friendly_name: "Outside Temperature" } },
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });

      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.writeHead(401).end(JSON.stringify({ message: "unauthorised" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");

      if (req.url === "/api/config") {
        res.end(JSON.stringify({ location_name: "Test Home", version: "2026.8.0" }));
      } else if (req.url === "/api/states") {
        res.end(JSON.stringify(Object.values(entities)));
      } else if (req.url.startsWith("/api/states/")) {
        const id = decodeURIComponent(req.url.slice("/api/states/".length));
        res.end(JSON.stringify(entities[id] || { entity_id: id, state: "unknown", attributes: {} }));
      } else if (req.url.startsWith("/api/services/")) {
        const [, , , domain, service] = req.url.split("/");
        const payload = JSON.parse(body || "{}");
        const entity = entities[payload.entity_id];
        if (entity) {
          if (service === "turn_on") entity.state = "on";
          if (service === "turn_off") entity.state = "off";
          if (service === "toggle") entity.state = entity.state === "on" ? "off" : "on";
          if (payload.brightness_pct != null) entity.attributes.brightness = payload.brightness_pct;
          if (payload.temperature != null) entity.attributes.temperature = payload.temperature;
        }
        res.end(JSON.stringify([{ entity_id: payload.entity_id, state: entity ? entity.state : "unknown" }]));
      } else {
        res.writeHead(404).end(JSON.stringify({ message: "not found" }));
      }
    });
  });
  return server;
}

(async () => {
  const server = startFakeHA();
  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let passed = 0;
  const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

  // --- she writes the code ---
  const spec = Skills.homeAssistantSpec(baseUrl);
  const source = Skills.generateAdapter(spec);

  assert.ok(source.includes("async function list()"), "adapter must expose list()");
  assert.ok(source.includes("/api/services/"), "adapter must call services");
  assert.ok(source.trim().split("\n").length > 40, "expected a real adapter, not a stub");
  ok(`writes a ${source.trim().split("\n").length}-line adapter from the API description`);

  assert.ok(!source.includes(TOKEN), "the token must never be written into generated source");
  assert.ok(source.includes("config.token"), "the token should be read from config at compile time");
  ok("keeps the secret out of the generated source");

  // --- the code she wrote compiles and runs ---
  const adapter = Skills.compile(source, { token: TOKEN }, globalThis.fetch);
  const info = await adapter.probe();
  assert.strictEqual(info.detail, "Test Home 2026.8.0");
  ok("compiles, connects and reports what answered");

  const things = await adapter.list();
  assert.strictEqual(things.length, 4);
  const kitchen = things.find((t) => t.id === "light.kitchen");
  assert.strictEqual(kitchen.name, "Kitchen Light");
  assert.strictEqual(kitchen.domain, "light");
  assert.strictEqual(kitchen.controllable, true);
  assert.strictEqual(things.find((t) => t.id === "sensor.outside").controllable, false, "a sensor is not controllable");
  ok("lists devices with names, domains and states");

  // --- and it controls real things ---
  received.length = 0;
  const onResult = await adapter.act("turn_on", kitchen, null);
  assert.strictEqual(onResult.done, "turn_on");
  const call = received.find((r) => r.url.includes("/api/services/"));
  assert.strictEqual(call.method, "POST");
  assert.strictEqual(call.url, "/api/services/light/turn_on");
  assert.deepStrictEqual(call.body, { entity_id: "light.kitchen" });
  assert.strictEqual(call.auth, `Bearer ${TOKEN}`);
  ok("turns a light on with the correct service call and auth header");

  received.length = 0;
  await adapter.act("set_level", kitchen, 42);
  const dim = received.find((r) => r.url.includes("/api/services/"));
  assert.strictEqual(dim.url, "/api/services/light/turn_on");
  assert.strictEqual(dim.body.brightness_pct, 42);
  ok("dims a light by percentage");

  received.length = 0;
  const hall = things.find((t) => t.id === "climate.hall");
  await adapter.act("set_level", hall, 21);
  const heat = received.find((r) => r.url.includes("/api/services/"));
  assert.strictEqual(heat.url, "/api/services/climate/set_temperature");
  assert.strictEqual(heat.body.temperature, 21);
  ok("sets a thermostat in degrees, not brightness");

  const state = await adapter.act("query_state", kitchen, null);
  assert.strictEqual(state.state, "on", "the light we switched on should read as on");
  ok("reads back the state it just changed");

  // --- failure modes are honest ---
  await assert.rejects(() => adapter.act("turn_on", null, null), /Which device/);
  await assert.rejects(() => adapter.act("fly", kitchen, null), /do not know how to/);
  const badAuth = Skills.compile(source, { token: "wrong" }, globalThis.fetch);
  await assert.rejects(() => badAuth.probe(), /401/);
  ok("fails clearly on a missing device, an unknown action and a bad token");

  // --- the generic generator works too ---
  const custom = Skills.restSpec({
    id: "lamps", name: "Lamp API", baseUrl, auth: { type: "bearer" },
    listPath: "/api/states", idKey: "entity_id", nameKey: "entity_id", stateKey: "state",
    actions: { turn_on: { method: "POST", path: "/api/services/light/turn_on" } },
  });
  const customSource = Skills.generateAdapter(custom);
  const customAdapter = Skills.compile(customSource, { token: TOKEN }, globalThis.fetch);
  const customThings = await customAdapter.list();
  assert.strictEqual(customThings.length, 4);
  ok("writes an adapter for a generic REST API as well");

  assert.throws(() => Skills.generateAdapter({ style: "rest" }), /base URL/);
  assert.throws(() => Skills.compile("return {};", {}), /missing probe/);
  ok("refuses an incomplete description or a broken adapter");

  server.close();
  console.log(`\nskills.js: ${passed} tests passed`);
})().catch((err) => {
  console.error(`\n✖ ${err.stack}`);
  process.exit(1);
});
