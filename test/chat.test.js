/* Her conversation — does she answer what she knows and refuse what she does not?
 *
 * The second half is the point. A chatbot that always produces an answer is
 * easy; one that produces an answer only when it has one is the thing worth
 * testing, because the failure mode of the easy version is a confident lie.
 */
"use strict";

const assert = require("assert");
const Chat = require("../chat.js");

let passed = 0;
const ok = (msg) => { console.log(`  ✔ ${msg}`); passed++; };

console.log("\n── her conversation ──");

const knowledge = new Chat.Knowledge();

// ---------------------------------------------------------------------------
// The question that started this
// ---------------------------------------------------------------------------
{
  for (const q of [
    "what does eve stand for",
    "what does your name stand for",
    "why are you called eve",
    "what does eve mean",
  ]) {
    const r = knowledge.find(q);
    assert.ok(r.answer, `she must answer "${q}"`);
    assert.match(r.answer, /Emergent Virtual Entity/,
      `"${q}" must get the meaning of her name, not a near-miss topic`);
  }
  ok("she knows what her own name stands for, however it is asked");
}

// ---------------------------------------------------------------------------
// The rest of what she knows
// ---------------------------------------------------------------------------
{
  const expected = [
    ["who made you", "who_made"],
    ["how do you work", "how_work"],
    ["are you chatgpt", "language_model"],
    ["are you alive", "alive"],
    ["what cant you do", "limits"],
    ["where are you running", "where_running"],
    ["how do you learn", "learning"],
    ["how old are you", "age"],
    ["can i teach you", "teach_me"],
    ["can you run on a raspberry pi", "raspberry_pi"],
  ];
  for (const [question, id] of expected) {
    const r = knowledge.find(question);
    assert.ok(r.answer, `she should answer "${question}"`);
    assert.strictEqual(r.id, id, `"${question}" should match ${id}, not ${r.id}`);
  }
  ok(`${expected.length} more questions each reach the right answer rather than a neighbouring one`);
}

// ---------------------------------------------------------------------------
// What she must refuse
// ---------------------------------------------------------------------------
{
  const beyondHer = [
    "what is the capital of peru",
    "write me a poem about the sea",
    "what is 17 times 4",
    "who won the world cup in 1998",
    "summarise the french revolution",
    "what should i cook tonight",
    "banana helicopter tuesday",
  ];
  for (const q of beyondHer) {
    const r = knowledge.find(q);
    assert.strictEqual(r.answer, null,
      `"${q}" must be refused, not answered with "${String(r.answer).slice(0, 40)}…"`);
  }
  ok(`${beyondHer.length} questions she has no answer for are refused rather than answered with the nearest topic`);

  // Empty and punctuation-only input must not crash or match anything.
  assert.strictEqual(knowledge.find("").answer, null);
  assert.strictEqual(knowledge.find("???").answer, null);
  ok("empty and meaningless input is refused without throwing");
}

// ---------------------------------------------------------------------------
// Rare words decide the match, not common ones
// ---------------------------------------------------------------------------
{
  /* "what" and "do" appear in nearly everything she knows, so they must not be
   * what decides an answer. This is the whole reason for weighting by how rare
   * a word is rather than counting shared words. */
  const common = knowledge.weight("what");
  const rare = knowledge.weight("raspberry");
  assert.ok(rare > common * 1.5,
    `a rare word (${rare.toFixed(2)}) must outweigh a common one (${common.toFixed(2)})`);
  ok("rare words outweigh common ones, so 'what do you' does not decide the answer");
}

// ---------------------------------------------------------------------------
// Teaching her
// ---------------------------------------------------------------------------
{
  const fresh = new Chat.Knowledge();
  assert.strictEqual(fresh.find("what is my dog called").answer, null,
    "she cannot know this yet");

  fresh.teach("what is my dog called", "Your dog is called Rufus.");
  const learned = fresh.find("what is my dog called");
  assert.strictEqual(learned.answer, "Your dog is called Rufus.");
  assert.strictEqual(learned.taught, true, "it should be marked as something you taught her");
  ok("something she was taught is answered afterwards, and marked as yours");

  // Teaching must not break what she already knew.
  assert.match(fresh.find("what does eve stand for").answer, /Emergent Virtual Entity/,
    "teaching her a fact must not displace what she already knew");
  ok("teaching her something new leaves everything she already knew intact");

  assert.strictEqual(fresh.taught.length, 1, "only the taught entry counts as taught");
  ok("she can tell what she was told from what she was built with");
}

// ---------------------------------------------------------------------------
// Reading "remember that ..."
// ---------------------------------------------------------------------------
{
  const parsed = Chat.parseTeaching("remember that my dog is called Rufus");
  assert.ok(parsed, "a plain 'remember that X is Y' must be understood");
  assert.match(parsed.question, /my dog/);
  assert.match(parsed.answer, /Rufus/);

  const explicit = Chat.parseTeaching("remember when I ask where the keys are, say on the hook");
  assert.ok(explicit);
  assert.match(explicit.question, /where the keys are/);
  assert.match(explicit.answer, /on the hook/);
  ok("both ways of teaching her are understood — 'X is Y' and 'when I ask X say Y'");

  /* Anything it cannot parse confidently returns nothing, so she asks rather
   * than storing a wrong pair. A fact she states confidently and wrongly is
   * worse than one she never learned. */
  assert.strictEqual(Chat.parseTeaching("remember"), null);
  assert.strictEqual(Chat.parseTeaching("what is the weather"), null);
  assert.strictEqual(Chat.parseTeaching("remember stuff"), null);
  ok("a teaching phrase it cannot read is refused, rather than stored as a wrong pair");
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
{
  const fresh = new Chat.Knowledge();
  fresh.teach("what is the wifi password", "It is on the back of the router.");
  const saved = fresh.taught.map((e) => ({ ask: e.ask, say: e.say }));

  const reloaded = new Chat.Knowledge(saved);
  assert.strictEqual(reloaded.find("what is the wifi password").answer,
    "It is on the back of the router.");
  assert.match(reloaded.find("what does eve stand for").answer, /Emergent Virtual Entity/);
  ok("what you taught her survives a restart, alongside what she was built with");
}

console.log(`\nher conversation: ${passed} checks passed`);
