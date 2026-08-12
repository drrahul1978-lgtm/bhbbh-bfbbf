/* The capability map: are the ratings earned, and does a gap come with an
 * honest route to closing it?
 * Run with:  node test/capabilities.test.js  */
const assert = require("assert");
const { CapabilityMap, LEVEL } = require("../eve/capabilities/map.js");

let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

/** A domain whose evidence I can move around, to test the rating rules. */
const fixed = (id, evidence) => ({ id, name: id.replace(/_/g, " "), collect: () => evidence });

(async () => {
  const map = new CapabilityMap({ domains: [] });

  // --- no evidence means unsupported, never a flattering default ---
  map.addDomain(fixed("untried", { successes: 0, failures: 0, note: "never attempted" }));
  const untried = map.rate("untried");
  assert.strictEqual(untried.level, LEVEL.UNSUPPORTED);
  assert.strictEqual(untried.confidence, 0);
  assert.strictEqual(untried.successRate, null, "no runs means no success rate, not 0% or 100%");
  ok("a capability with no evidence is unsupported, not unknown and not assumed");

  // --- a rating cannot exceed the evidence for it ---
  map.addDomain(fixed("lucky", { successes: 4, failures: 0 }));
  const lucky = map.rate("lucky");
  assert.strictEqual(lucky.level, LEVEL.LIMITED, "a perfect record over four runs is still only limited");
  assert.match(lucky.why, /too few/);
  assert.ok(lucky.confidence < 0.2, "and confidence should reflect how little evidence there is");
  ok("four successes is 'limited, on four runs' — a rating cannot outrun its evidence");

  map.addDomain(fixed("proven", { successes: 38, failures: 2 }));
  const proven = map.rate("proven");
  assert.strictEqual(proven.level, LEVEL.STRONG);
  assert.ok(proven.confidence > 0.9);
  ok("a high success rate over enough runs does earn 'strong'");

  map.addDomain(fixed("shaky", { successes: 25, failures: 7 }));  // 78%
  assert.strictEqual(map.rate("shaky").level, LEVEL.MODERATE);
  map.addDomain(fixed("poor", { successes: 8, failures: 20 }));   // 29%
  assert.strictEqual(map.rate("poor").level, LEVEL.LIMITED);
  ok("failure rates pull ratings down through moderate to limited");

  // --- being corrected counts against a capability ---
  map.addDomain(fixed("corrected", { successes: 36, failures: 4, corrections: 12 }));
  const corrected = map.rate("corrected");
  assert.notStrictEqual(corrected.level, LEVEL.STRONG, "corrections must stop a 90% run rate reading as strong");
  assert.strictEqual(corrected.corrections, 12);
  assert.match(corrected.why, /correction/);
  ok("being told she was wrong counts against the capability, not just that answer");

  // --- ratings are derived, so they cannot go stale ---
  let runs = { successes: 40, failures: 0 };
  map.addDomain({ id: "drifting", name: "drifting", collect: () => runs });
  assert.strictEqual(map.rate("drifting").level, LEVEL.STRONG);
  runs = { successes: 40, failures: 60 };   // it started failing
  assert.strictEqual(map.rate("drifting").level, LEVEL.LIMITED,
    "a rating must fall when the evidence does — nothing is stored");
  ok("ratings are recomputed from evidence every read, so a skill that rots is downgraded");

  // --- the table ---
  const table = map.render();
  assert.match(table, /proven +→ Strong/);
  assert.match(table, /untried +→ Unsupported/);
  assert.ok(map.all()[0].level === LEVEL.STRONG, "strongest first");
  ok("the map renders as the plain table the brief asks for");

  // --- gaps come with a route, or an honest blocker ---
  const gapMap = new CapabilityMap({ domains: [fixed("home automation", { successes: 30, failures: 1 })] });

  const learnable = gapMap.assess("connect to my new sprinkler REST api");
  assert.strictEqual(learnable.covered, false);
  assert.strictEqual(learnable.canAcquire, true);
  assert.match(learnable.answer, /I can learn it/);
  assert.ok(learnable.needs.length, "and it should say what it needs to do that");
  ok("an unfamiliar REST service is reported as learnable, with what she needs");

  const hardware = gapMap.assess("print this model on my 3D printer");
  assert.strictEqual(hardware.canAcquire, false);
  assert.match(hardware.answer, /cannot learn it as I am/);
  assert.match(hardware.answer, /driver and physical access/);
  ok("a hardware capability is refused with the actual reason, not a vague no");

  const reasoning = gapMap.assess("write me an essay about the Roman empire");
  assert.strictEqual(reasoning.canAcquire, false);
  assert.match(reasoning.answer, /language model/);
  assert.match(reasoning.answer, /training longer will not change it/);
  ok("open-ended writing is refused with the real reason: it needs a model she does not have");

  const known = gapMap.assess("home automation for the kitchen light");
  assert.strictEqual(known.covered, true);
  assert.strictEqual(known.level, LEVEL.STRONG);
  ok("something she has actually done reports as covered, with its evidence");

  const unrecognised = gapMap.assess("xyzzy plugh");
  assert.strictEqual(unrecognised.covered, false);
  assert.strictEqual(unrecognised.canAcquire, null);
  assert.match(unrecognised.answer, /I match requests by words/);
  ok("an unrecognised request admits the matching is word-based rather than guessing");

  // --- a limited capability warns you ---
  const weak = new CapabilityMap({ domains: [fixed("vision", { successes: 3, failures: 4 })] });
  const warned = weak.assess("vision check on this");
  assert.strictEqual(warned.covered, true);
  assert.strictEqual(warned.level, LEVEL.LIMITED);
  assert.match(warned.caveat, /expect to have to correct me/);
  ok("a weak capability says so up front rather than being quietly unreliable");

  assert.throws(() => map.addDomain({ id: "bad" }), /needs an id and a collect/);
  ok("a domain without a way to collect real evidence is refused");

  console.log(`\neve/capabilities: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
