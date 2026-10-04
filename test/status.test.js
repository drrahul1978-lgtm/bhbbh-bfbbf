/* Her status light — does the right colour win?
 *
 * The ordering is the whole point. A light that goes green while something is
 * broken, or stays green when she is stuck waiting on you, is worse than no
 * light: you learn to trust it and it lies to you once.
 */
"use strict";

const assert = require("assert");
const { Status } = require("../eve/status.js");
const { StatusLight, DEFAULT_PINS } = require("../eve/platform/gpio.js");

let passed = 0;
const ok = (msg) => { console.log(`  ✔ ${msg}`); passed++; };

console.log("\n── her status light ──");

const wire = () => {
  const light = new StatusLight({ backend: "simulated" });
  return { light, status: new Status({ light }) };
};

// ---------------------------------------------------------------------------
// Green when all is well
// ---------------------------------------------------------------------------
{
  const { light, status } = wire();
  status.observeHealth({ ok: true, problems: [] });
  assert.strictEqual(status.colour, "green");
  assert.strictEqual(light.colour, "green");
  ok("nothing wrong and nothing pending shows green");
}

// ---------------------------------------------------------------------------
// Yellow when she needs you — the case this was built for
// ---------------------------------------------------------------------------
{
  const { light, status } = wire();
  status.observeHealth({ ok: true, problems: [] });
  assert.strictEqual(light.colour, "green");

  status.sawSomethingUnknown("a small board with wires in it");
  assert.strictEqual(status.colour, "yellow", "an object she cannot name must bring her to yellow");
  assert.strictEqual(light.colour, "yellow");
  assert.match(status.reason, /do not know what to do/);
  assert.match(status.reason, /small board with wires/,
    "the reason must say what she actually saw, not just that something happened");
  ok("seeing something she cannot name turns the light yellow, and says what it saw");

  status.resolved("unknown_object");
  assert.strictEqual(light.colour, "green", "once you have told her, it goes back to green");
  ok("teaching her clears the yellow");
}

// ---------------------------------------------------------------------------
// Red outranks yellow, always
// ---------------------------------------------------------------------------
{
  const { light, status } = wire();
  status.sawSomethingUnknown();
  assert.strictEqual(light.colour, "yellow");

  status.observeHealth({ ok: false, problems: ["temperature 82C is above the 75C limit"] });
  assert.strictEqual(status.colour, "red",
    "a health problem must outrank her waiting on you");
  assert.match(status.reason, /82C/);
  ok("a fault outranks needing you — the light never reassures while something worse is true");

  // And when the fault clears, the thing she was still waiting on comes back.
  status.observeHealth({ ok: true, problems: [] });
  assert.strictEqual(status.colour, "yellow",
    "the ask she was waiting on must come back, not be forgotten because a fault covered it");
  ok("when the fault clears, the question she was still waiting on reappears");
}

// ---------------------------------------------------------------------------
// Faults
// ---------------------------------------------------------------------------
{
  const { status } = wire();
  status.observeHealth({ ok: true, problems: [] });
  status.fault("model", "her mind file will not load");
  assert.strictEqual(status.colour, "red");
  assert.match(status.reason, /mind file/);

  status.clearFault("model");
  assert.strictEqual(status.colour, "green");
  ok("a broken part shows red with its reason, and green once repaired");
}

// ---------------------------------------------------------------------------
// The same thing happening repeatedly is one ask
// ---------------------------------------------------------------------------
{
  const { status } = wire();
  status.observeHealth({ ok: true, problems: [] });
  for (let i = 0; i < 20; i++) status.sawSomethingUnknown("the same mug");
  const state = status.assess();
  assert.strictEqual(state.count, 1,
    "seeing one unknown thing twenty times is one question, not twenty");
  ok("seeing the same unknown thing repeatedly is one question, not a queue of them");
}

// ---------------------------------------------------------------------------
// An ask expires, so she does not sit yellow forever
// ---------------------------------------------------------------------------
{
  const { light, status } = wire();
  status.observeHealth({ ok: true, problems: [] });

  const t0 = 1_000_000;
  status.needsYou("unknown_object", "I saw something odd", t0);
  assert.strictEqual(status.colour, "yellow");

  status.update(t0 + 29000);
  assert.strictEqual(status.colour, "yellow", "still waiting just under the limit");

  status.update(t0 + 31000);
  assert.strictEqual(status.colour, "green",
    "after the hold time with nothing new, she stops asking");
  assert.strictEqual(light.colour, "green");
  ok("a question she has stopped seeing expires, so the light does not sit yellow forever");
}

// ---------------------------------------------------------------------------
// The light itself
// ---------------------------------------------------------------------------
{
  const light = new StatusLight({ backend: "simulated" });
  assert.strictEqual(light.wired, false, "there is no GPIO in this container");
  assert.match(light.describe(), /not lit/);

  light.red();
  light.yellow();
  light.green();
  assert.deepStrictEqual(light.history.map((h) => h.colour), ["red", "yellow", "green"]);
  ok("every change is recorded, so the logic is testable with no Pi on the desk");

  assert.throws(() => light.show("blue"), /no blue light/,
    "asking for a colour she has no LED for must fail loudly, not silently do nothing");
  ok("a colour she has no LED for is refused rather than quietly ignored");

  light.off();
  assert.strictEqual(light.colour, null);
  ok("she can turn all three off, so a stale colour is not left lit on shutdown");

  assert.deepStrictEqual(Object.keys(DEFAULT_PINS).sort(), ["green", "red", "yellow"]);
  // Pins must not collide, or two colours fight over one wire.
  const pins = Object.values(DEFAULT_PINS);
  assert.strictEqual(new Set(pins).size, pins.length, "every colour needs its own pin");
  ok(`the three default pins are distinct: ${pins.join(", ")}`);
}

// ---------------------------------------------------------------------------
// A miswired light must not take her down
// ---------------------------------------------------------------------------
{
  const broken = new StatusLight({ backend: "simulated" });
  broken.backend = { name: "broken", write: () => { throw new Error("pin 17 is not available"); }, release: () => {} };
  broken.mode = "broken";

  const result = broken.show("red");
  assert.ok(result.failed && result.failed.length, "the failure must be reported");
  assert.strictEqual(broken.colour, "red", "she still knows what colour she meant");
  ok("a light that cannot be driven is reported, not thrown — a bad wire does not stop her");
}

console.log(`\nher status light: ${passed} checks passed`);
