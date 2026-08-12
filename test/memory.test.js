/* Memory: does she find the right thing, keep what you told her, and refuse to
 * pour everything into every conversation?
 * Run with:  node test/memory.test.js  */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { Memory, TIER } = require("../eve/memory/store.js");
const { KnowledgeGraph } = require("../eve/memory/graph.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-memory-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

(async () => {
  const memory = new Memory({ dir: path.join(tmp, "memory"), saveEveryMs: 10 });

  // --- the tiers are used differently ---
  memory.remember({ text: "The Home Assistant hub lives at 192.168.1.40", source: "user_confirmed", subject: "hub address" });
  memory.remember({ text: "The kitchen light is a Hue bulb on the upstairs bridge", source: "observed" });
  memory.remember({ text: "A forum post claimed the thermostat needs port 9000", source: "community" });
  memory.rememberProcedure({
    task: "connect to the thermostat",
    steps: ["read openapi.json", "generate adapter", "test in isolation", "install"],
    skill: "thermostat", outcome: "succeeded", ms: 4200,
  });
  memory.remember({ text: "scratch note about nothing", tier: TIER.SHORT_TERM });

  assert.strictEqual(memory.stats().byTier[TIER.LONG_TERM], 3);
  assert.strictEqual(memory.stats().byTier[TIER.PROCEDURAL], 1);
  assert.strictEqual(memory.stats().shortTerm, 1);
  ok("long-term, procedural and short-term memories are kept separately");

  // --- retrieval finds the relevant one, not everything ---
  const hits = memory.recall("where is the hub");
  assert.ok(hits.length >= 1);
  assert.match(hits[0].text, /192\.168\.1\.40/, "the address should come back first");
  assert.ok(hits[0].score > 0, "and it should carry a score");
  ok("asking about the hub returns the hub, with a score attached");

  // What you said outranks what a forum said, all else being equal.
  memory.remember({ text: "The thermostat uses port 8123 not 9000", source: "user_confirmed" });
  const thermostat = memory.recall("thermostat port");
  assert.strictEqual(thermostat[0].source, "user_confirmed", "your word should outrank a forum post");
  ok("a fact you confirmed outranks one from a community source");

  // --- the honest limit, tested rather than hidden ---
  const synonym = memory.recall("luminaire");
  assert.strictEqual(synonym.length, 0, "word matching cannot find synonyms, and the tests say so");
  ok("matching is by words not meaning — a synonym finds nothing, as documented");

  // --- procedural recall ---
  const procedure = memory.recallProcedure("connect to the thermostat");
  assert.strictEqual(procedure.length, 1);
  assert.deepStrictEqual(procedure[0].meta.steps[0], "read openapi.json");
  ok("a task that worked before comes back with the steps that worked");

  memory.rememberProcedure({ task: "connect to the doorbell", steps: ["guess"], outcome: "failed" });
  const doorbell = memory.recallProcedure("connect to the doorbell");
  assert.ok(!doorbell.some((p) => p.meta.outcome === "failed"),
    "a procedure that failed must never be offered as how to do something");
  assert.ok(!doorbell.some((p) => p.meta.task.includes("doorbell")),
    "specifically, the failed doorbell attempt must not come back");
  ok("failed procedures are remembered but never suggested as the way to do something");

  // The flip side of word matching, demonstrated rather than glossed over: a
  // different task sharing a verb can still surface. The score shows it is thin.
  assert.ok(doorbell.length > 0 && doorbell[0].meta.task.includes("thermostat"),
    "the thermostat procedure matches on the shared word 'connect'");
  assert.ok(doorbell[0].score < memory.recallProcedure("connect to the thermostat")[0].score,
    "…but scores lower than the task it actually describes");
  ok("a loosely related task can surface on a shared word, and scores lower for it");

  // --- selective context, the whole point ---
  for (let i = 0; i < 40; i++) {
    memory.remember({ text: `The hub reported status message number ${i} about the network`, source: "observed" });
  }
  const context = memory.context("hub network status", { budget: 200 });
  assert.ok(context.used <= 200, "the budget must actually be respected");
  assert.ok(context.included < context.considered, "and something must have been left out");
  assert.ok(context.omitted > 0);
  ok("context fills a budget with the best matches and leaves the rest behind");

  // --- forgetting, with a line it will not cross ---
  const small = new Memory({ dir: path.join(tmp, "small"), capacity: 10, saveEveryMs: 10 });
  small.remember({ text: "something you told me and I must not lose", source: "user_confirmed" });
  small.remember({ text: "pinned for another reason", source: "community", pinned: true });
  for (let i = 0; i < 25; i++) small.remember({ text: `disposable observation ${i}`, source: "unknown", importance: 0.2 });

  assert.ok(small.stats().total <= 12, "memory should stay near its capacity");
  const survivors = small.items.map((i) => i.text);
  assert.ok(survivors.some((t) => t.includes("you told me")), "what you said must survive eviction");
  assert.ok(survivors.some((t) => t.includes("pinned")), "and so must anything pinned");
  ok("memory stays bounded, but never forgets what you told it or what is pinned");

  // --- persistence ---
  memory.save();
  const reopened = new Memory({ dir: path.join(tmp, "memory") });
  assert.ok(reopened.recall("where is the hub").length >= 1, "memories survive a restart");
  assert.strictEqual(reopened.clearShortTerm(), 0, "short-term notes are deliberately not persisted");
  ok("long-term memory survives a restart while short-term working notes do not");

  // --- knowledge graph ---
  const graph = new KnowledgeGraph({ file: path.join(tmp, "graph.json") });
  graph.entity("kitchen", { type: "room", name: "Kitchen" });
  graph.entity("light.kitchen", { type: "device", name: "Kitchen Light", attrs: { domain: "light" } });
  graph.entity("home_assistant", { type: "skill", name: "Home Assistant" });
  graph.entity("rahul", { type: "person", name: "Rahul" });

  graph.link("kitchen", "CONTAINS", "light.kitchen");
  graph.link("home_assistant", "CONTROLS", "light.kitchen");
  graph.link("rahul", "OWNS", "home_assistant");

  // The inverse is stored, so a fact reads from either end.
  const roomOf = graph.neighbours("light.kitchen", { rel: "IS_IN" });
  assert.strictEqual(roomOf[0].node.name, "Kitchen", "a containment fact should read backwards too");
  ok("a relationship is readable from both ends without storing it twice by hand");

  const route = graph.path("rahul", "light.kitchen");
  assert.ok(route && route.length >= 2, "there should be a path from the person to the device");
  assert.strictEqual(route.at(-1).to, "light.kitchen");
  ok("the graph can explain how a person is connected to a device");

  assert.strictEqual(graph.path("rahul", "nonexistent"), null);
  assert.strictEqual(graph.byType("device").length, 1);
  assert.match(graph.describe("kitchen").summary, /contains Kitchen Light/);
  ok("unknown entities return nothing, and an entity describes itself readably");

  graph.save();
  const graphAgain = new KnowledgeGraph({ file: path.join(tmp, "graph.json") });
  assert.strictEqual(graphAgain.get("light.kitchen").name, "Kitchen Light");
  assert.strictEqual(graphAgain.stats().nodes, 4);
  ok("the graph survives a restart with its entities and relationships intact");

  // Attributes merge rather than replace.
  graphAgain.entity("light.kitchen", { attrs: { brightness: 80 } });
  const merged = graphAgain.get("light.kitchen");
  assert.strictEqual(merged.attrs.domain, "light", "learning one new thing must not erase the rest");
  assert.strictEqual(merged.attrs.brightness, 80);
  ok("learning a new attribute merges rather than overwriting what was known");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\neve/memory: ${passed} tests passed`);
})().catch((err) => { console.error(`\n✖ ${err.stack}`); process.exit(1); });
