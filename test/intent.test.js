/* Checks that Eve works out what you meant — on sentences that are NOT in her
 * training templates, and against device names she has never seen.
 * Run with:  node test/intent.test.js  */
const assert = require("assert");
const Intent = require("../intent.js");

console.log("Training the language model…");
const t0 = Date.now();
const { net, rows } = Intent.train();
console.log(`  ${rows.length} phrases, ${Intent.INTENT_NAMES.length} intents, ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

// Phrasings deliberately unlike the templates: different devices, different
// word order, extra politeness, contractions.
const HELD_OUT = [
  ["could you switch on the study lamp", "turn_on"],
  ["turn the greenhouse heater on now", "turn_on"],
  ["shut off the aquarium pump", "turn_off"],
  ["switch off the christmas tree lights", "turn_off"],
  ["kill the bedroom fan", "turn_off"],
  ["toggle the shed light", "toggle"],
  ["set the nursery lamp to 30", "set_level"],
  ["dim the cinema lights to 12", "set_level"],
  ["is the workshop heater on", "query_state"],
  ["check the loft sensor", "query_state"],
  ["what is the conservatory fan doing", "query_state"],
  ["list my devices", "list_devices"],
  ["what can you control", "list_devices"],
  ["show devices", "list_devices"],
  ["connect to home assistant", "connect"],
  ["write an adapter for this api", "connect"],
  ["grade this card", "grade_card"],
];

const results = HELD_OUT.map(([text, expected]) => {
  const got = Intent.classify(net, text);
  return { text, expected, got: got.intent, confidence: got.confidence };
});
const correct = results.filter((r) => r.got === r.expected);
for (const r of results.filter((r) => r.got !== r.expected)) {
  console.log(`      miss: "${r.text}" → ${r.got} (wanted ${r.expected}, ${r.confidence.toFixed(2)})`);
}
const accuracy = correct.length / results.length;
console.log(`      ${correct.length}/${results.length} correct on unseen phrasings`);
assert.ok(accuracy >= 0.8, `expected at least 80% on held-out phrasings, got ${(accuracy * 100).toFixed(0)}%`);
ok("understands phrasings it was never trained on");

// On/off must never be confused — they share every word but one.
for (const [text, expected] of [
  ["turn on the hallway light", "turn_on"],
  ["turn off the hallway light", "turn_off"],
  ["switch on the pump", "turn_on"],
  ["switch off the pump", "turn_off"],
]) {
  const got = Intent.classify(net, text);
  assert.strictEqual(got.intent, expected, `"${text}" must be ${expected}, got ${got.intent}`);
}
ok("never mixes up on and off");

// Nonsense should be admitted, not guessed at.
const nonsense = Intent.classify(net, "banana helicopter tuesday quantum");
assert.strictEqual(nonsense.intent, "unknown", `expected unknown, got ${nonsense.intent} at ${nonsense.confidence.toFixed(2)}`);
ok("says 'unknown' instead of guessing at nonsense");

// Slots: pick the right device out of a real-looking entity list.
const THINGS = [
  { id: "light.kitchen", name: "Kitchen Light", domain: "light" },
  { id: "light.kitchen_counter", name: "Kitchen Counter Light", domain: "light" },
  { id: "switch.coffee", name: "Coffee Machine", domain: "switch" },
  { id: "climate.hall", name: "Hall Thermostat", domain: "climate" },
  { id: "fan.bedroom", name: "Bedroom Fan", domain: "fan" },
];

assert.strictEqual(Intent.extractSlots("turn on the coffee machine", THINGS).thing.id, "switch.coffee");
assert.strictEqual(Intent.extractSlots("turn off the bedroom fan", THINGS).thing.id, "fan.bedroom");
assert.strictEqual(Intent.extractSlots("kitchen counter light off", THINGS).thing.id, "light.kitchen_counter",
  "the more specific name should win");
assert.strictEqual(Intent.extractSlots("set the hall thermostat to 21", THINGS).number, 21);
assert.strictEqual(Intent.extractSlots("turn on the spaceship", THINGS).thing, null,
  "an unknown device must not be matched to something random");
ok("picks the right device, including the more specific of two similar names");

// The whole thing together.
const understood = Intent.understand(net, "dim the kitchen light to 25", THINGS);
assert.strictEqual(understood.intent, "set_level");
assert.strictEqual(understood.thing.id, "light.kitchen");
assert.strictEqual(understood.number, 25);
ok("turns one sentence into intent + device + value");

console.log(`\nintent.js: ${passed} tests passed`);
