/* intent.js — how Eve works out what you are asking for.
 *
 * This is the same network from nn.js pointed at words instead of pixels. A
 * sentence is hashed into a fixed-width bag of words and bigrams, and the net
 * classifies it into one of a handful of intents. It is trained on phrasings
 * generated right here, so — exactly like everything else she learns — from
 * examples this file creates rather than from any downloaded corpus.
 *
 * Be clear about the ceiling: this recognises *which* of a known set of things
 * you want. It does not understand language in general, and it cannot write
 * programs from a description. What it can do is route a request to the right
 * skill and pull the obvious details (which device, what number) out of it. */
(function (root) {
  "use strict";

  const NN = root.NN || (typeof require !== "undefined" ? require("./nn.js") : null);

  const DIM = 256; // hashed feature width

  /**
   * Every intent Eve can recognise, with the phrasings she is trained on.
   * {thing} stands in for a device name, {number} for a value.
   */
  const INTENTS = {
    list_devices: [
      "what devices do you have", "list my devices", "show me everything",
      "what can you control", "what is connected", "show devices",
      "list entities", "what lights do i have", "show me my devices",
      "what do you see on the network", "give me a list of devices",
    ],
    turn_on: [
      "turn on the {thing}", "switch on the {thing}", "put the {thing} on",
      "{thing} on", "turn the {thing} on", "please turn on the {thing}",
      "activate the {thing}", "power on the {thing}", "can you turn on the {thing}",
      "i want the {thing} on", "start the {thing}", "enable the {thing}",
    ],
    turn_off: [
      "turn off the {thing}", "switch off the {thing}", "put the {thing} off",
      "{thing} off", "turn the {thing} off", "please turn off the {thing}",
      "deactivate the {thing}", "power off the {thing}", "can you turn off the {thing}",
      "i want the {thing} off", "stop the {thing}", "disable the {thing}",
      "kill the {thing}", "shut off the {thing}",
    ],
    toggle: [
      "toggle the {thing}", "flip the {thing}", "switch the {thing}",
      "change the {thing}", "toggle {thing}",
    ],
    set_level: [
      "set the {thing} to {number}", "dim the {thing} to {number}",
      "set {thing} brightness to {number}", "make the {thing} {number} percent",
      "{thing} to {number} percent", "brightness {number} on the {thing}",
      "set the {thing} to {number} degrees", "put the {thing} at {number}",
    ],
    query_state: [
      "is the {thing} on", "what is the {thing} doing", "state of the {thing}",
      "check the {thing}", "is the {thing} off", "how is the {thing}",
      "tell me about the {thing}", "what is the {thing} set to",
      "is the {thing} running",
    ],
    connect: [
      "connect to home assistant", "hook up home assistant", "link home assistant",
      "connect to my smart home", "set up the home assistant api",
      "connect to the api", "add a new api", "connect to a new service",
      "pair with home assistant", "i want to connect home assistant",
      "learn a new api", "teach yourself this api", "write an adapter for this api",
    ],
    what_can_you_do: [
      "what can you do", "what are you", "who are you", "what do you know",
      "tell me about yourself", "what have you learned", "what skills do you have",
      "what apis do you know", "list your skills", "how good are you",
    ],
  };

  const INTENT_NAMES = Object.keys(INTENTS);

  // Words that stand in for a device when generating training phrases.
  const SAMPLE_THINGS = [
    "kitchen light", "living room lamp", "bedroom light", "fan", "heater",
    "front door", "porch light", "tv", "coffee machine", "thermostat",
    "garage door", "bathroom fan", "desk lamp", "hallway lights", "speaker",
    "air conditioner", "kettle", "printer", "office light", "back door",
  ];

  const STOP_WORDS = new Set(["the", "a", "an", "please", "can", "you", "my", "i", "to", "on", "off", "is", "it"]);

  /** Split a sentence into lowercase word tokens. */
  const tokenize = (text) =>
    String(text).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

  /** Cheap deterministic string hash (FNV-1a). */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /**
   * Sentence → fixed-width vector. Single words and adjacent pairs are hashed
   * into buckets; pairs matter because "turn on" and "turn off" share every
   * word but mean opposite things.
   */
  function featurise(text) {
    const tokens = tokenize(text);
    const x = new Float32Array(DIM);
    const bump = (key, weight) => { x[hash(key) % DIM] += weight; };
    for (let i = 0; i < tokens.length; i++) {
      bump(tokens[i], 1);
      if (i + 1 < tokens.length) bump(`${tokens[i]}_${tokens[i + 1]}`, 1.2);
    }
    // Scale to unit length so long sentences do not shout down short ones.
    let norm = 0;
    for (const v of x) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < DIM; i++) x[i] /= norm;
    return x;
  }

  /** Expand the templates into training rows, filling in devices and numbers. */
  function buildTrainingSet(seed = 1234) {
    const rand = NN.mulberry32(seed);
    const rows = [];
    const pick = (list) => list[Math.floor(rand() * list.length)];

    INTENT_NAMES.forEach((name, index) => {
      for (const template of INTENTS[name]) {
        // Several fillings of each template, so the net sees the shape of the
        // phrase rather than memorising one device name.
        const repeats = template.includes("{thing}") ? 8 : 3;
        for (let r = 0; r < repeats; r++) {
          const text = template
            .replace(/\{thing\}/g, () => pick(SAMPLE_THINGS))
            .replace(/\{number\}/g, () => String(Math.floor(rand() * 100)));
          const y = new Float32Array(INTENT_NAMES.length);
          y[index] = 1;
          rows.push({ x: featurise(text), y, text, intent: name });
        }
      }
    });
    return rows;
  }

  /** Train the classifier. Small and fast — about a second, even on a Pi. */
  function train(opts = {}) {
    const rows = buildTrainingSet(opts.seed ?? 1234);
    const net = new NN.Net([DIM, 48, INTENT_NAMES.length], { seed: opts.netSeed ?? 99 });
    const rand = NN.mulberry32(7);
    const xs = rows.map((r) => r.x);
    const ys = rows.map((r) => r.y);
    // 60 epochs reaches full accuracy on held-out phrasings; more is just time
    // a Raspberry Pi does not need to spend.
    const epochs = opts.epochs ?? 60;
    for (let e = 0; e < epochs; e++) net.trainEpoch(xs, ys, { lr: opts.lr ?? 0.03, batchSize: 16, rand });
    return { net, rows };
  }

  /** Save the trained classifier so it never has to be trained twice. */
  function toJSON(net) {
    const compact = net.toJSON();
    // Five decimals is far more precision than a classifier needs, and it cuts
    // the file to a third of the size — this gets served to every visitor.
    compact.layers = compact.layers.map((l) => ({
      W: l.W.map((v) => Math.round(v * 1e5) / 1e5),
      b: l.b.map((v) => Math.round(v * 1e5) / 1e5),
    }));
    return { format: "eve-intent-1", dim: DIM, intents: INTENT_NAMES, net: compact };
  }

  /**
   * Reload a saved classifier. Returns null if the file predates a change to
   * the intent list or feature width, so a stale model is retrained rather
   * than silently answering with the wrong labels.
   */
  function fromJSON(obj) {
    if (!obj || obj.format !== "eve-intent-1") return null;
    if (obj.dim !== DIM) return null;
    if (obj.intents.join(",") !== INTENT_NAMES.join(",")) return null;
    return NN.Net.fromJSON(obj.net);
  }

  /**
   * Classify a sentence. Returns the best intent, how confident she is, and the
   * runners-up — confidence matters, because a request she does not recognise
   * should be admitted rather than guessed at.
   */
  function classify(net, text) {
    const out = net.predict(featurise(text));
    const scored = INTENT_NAMES
      .map((name, i) => ({ intent: name, score: out[i] }))
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    return {
      intent: top.score < 0.35 ? "unknown" : top.intent,
      confidence: top.score,
      runnerUp: scored[1],
      ranked: scored,
    };
  }

  /**
   * Pull the details out of the sentence: which known device is being talked
   * about, and any number in it. Device matching is by word overlap against the
   * names the connected system actually reported, so it adapts to whatever is
   * on your network without retraining.
   */
  function extractSlots(text, knownThings = []) {
    const tokens = tokenize(text).filter((t) => !STOP_WORDS.has(t));
    const numberMatch = String(text).match(/\b(\d+(?:\.\d+)?)\b/);

    let best = null;
    let bestScore = 0;
    for (const thing of knownThings) {
      const name = thing.name || thing.id || String(thing);
      const nameTokens = tokenize(name).filter((t) => !STOP_WORDS.has(t));
      if (!nameTokens.length) continue;
      const hits = nameTokens.filter((t) => tokens.includes(t)).length;
      if (!hits) continue;
      // Favour matching most of the device's name, and break ties by
      // specificity so "kitchen light" beats a generic "light".
      const score = hits / nameTokens.length + hits * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = thing;
      }
    }

    return {
      thing: bestScore >= 0.5 ? best : null,
      thingConfidence: bestScore,
      number: numberMatch ? Number(numberMatch[1]) : null,
    };
  }

  /** Everything needed to act on a sentence, in one call. */
  function understand(net, text, knownThings = []) {
    const result = classify(net, text);
    const slots = extractSlots(text, knownThings);
    return { text, ...result, ...slots };
  }

  const Intent = {
    DIM, INTENTS, INTENT_NAMES, SAMPLE_THINGS,
    tokenize, featurise, buildTrainingSet, train, classify, extractSlots, understand, toJSON, fromJSON,
  };
  root.Intent = Intent;
  if (typeof module !== "undefined" && module.exports) module.exports = Intent;
})(typeof self !== "undefined" ? self : globalThis);
