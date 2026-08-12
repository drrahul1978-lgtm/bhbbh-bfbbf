#!/usr/bin/env node
/* eve-connect.js — Eve talking to your smart home, from the command line.
 * Built for a Raspberry Pi 4: no browser, no CORS, no cloud.
 *
 *   node eve-connect.js --url http://homeassistant.local:8123 --token XXX --list
 *   node eve-connect.js --url ... --token ... "turn on the kitchen light"
 *   node eve-connect.js --url ... --token ... --chat
 *   node eve-connect.js --url ... --token ... --show-code
 *
 * Or point her at an API she has never seen and let her work it out herself:
 *
 *   node eve-connect.js --api http://192.168.1.50:9000 --token XXX --list
 *   node eve-connect.js --api http://... --offline      (never touch the web)
 *
 * The token can also come from the environment, which keeps it out of your
 * shell history:  export HA_TOKEN=...   export HA_URL=...
 *
 * What happens on first run: Eve has no Home Assistant code. She writes it —
 * generating an adapter from the API's description, saving it to
 * eve-skills/home_assistant.js so you can read exactly what she wrote, then
 * loading it and using it. After that the file is reused.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const NN = require("./nn.js");
const Intent = require("./intent.js");
const Skills = require("./skills.js");
const Discover = require("./discover.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const URL_ARG = flag("url", process.env.HA_URL);
const TOKEN = flag("token", process.env.HA_TOKEN);
const SKILL_DIR = path.join(__dirname, "eve-skills");
const SKILL_FILE = path.join(SKILL_DIR, "home_assistant.js");
const INTENT_FILE = path.join(__dirname, "eve-intent.json");
const SPEC_DIR = path.join(SKILL_DIR, "specs");
const API_ARG = flag("api", null);      // discover an API she has never met
const OFFLINE = has("offline");

// Flags that consume the argument after them — their values must not be
// mistaken for part of what you typed, or a URL's digits get read as a value.
const VALUED_FLAGS = ["url", "token", "api", "name", "search-url"];

// The free text is whatever is left once the flags and their values are removed.
const command = args
  .filter((a, i) => {
    if (a.startsWith("--")) return false;
    const previous = args[i - 1];
    return !(previous && previous.startsWith("--") && VALUED_FLAGS.includes(previous.slice(2)));
  })
  .join(" ")
  .trim();

const say = (...m) => console.log(...m);

/**
 * Load the language model if one is already trained, otherwise train it and
 * save it. Training takes seconds on a laptop but the better part of a minute
 * on a Pi, and there is no reason to pay that on every command.
 */
function loadOrTrainIntent() {
  if (fs.existsSync(INTENT_FILE) && !has("retrain-language")) {
    const net = Intent.fromJSON(JSON.parse(fs.readFileSync(INTENT_FILE, "utf8")));
    if (net) {
      say(`   language model loaded (${Intent.INTENT_NAMES.length} intents)`);
      return net;
    }
    say("   saved language model is out of date — retraining");
  }
  const t0 = Date.now();
  const { net } = Intent.train();
  fs.writeFileSync(INTENT_FILE, JSON.stringify(Intent.toJSON(net)));
  say(`   trained her language model on ${Intent.INTENT_NAMES.length} intents in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return net;
}

const specFileFor = (id) => path.join(SPEC_DIR, `${id}.json`);

/** Anything she has worked out before, so a Pi with no WiFi still starts up. */
function loadCachedSpec(baseUrl) {
  if (!fs.existsSync(SPEC_DIR)) return null;
  for (const file of fs.readdirSync(SPEC_DIR)) {
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, file), "utf8"));
      if (saved.baseUrl === String(baseUrl).replace(/\/+$/, "")) return saved;
    } catch { /* skip an unreadable cache entry */ }
  }
  return null;
}

/**
 * Point her at an API she has never seen and let her work it out: read its own
 * description if it publishes one, otherwise study what its endpoints return,
 * otherwise (online only) look for a published description on the web.
 */
async function discoverApi(baseUrl) {
  const cached = loadCachedSpec(baseUrl);
  if (cached && !has("rediscover")) {
    say(`🧠 I worked this API out before — reusing what I learned about ${cached.name}.`);
  } else {
    say(`🔍 I have never seen ${baseUrl} before. Working out what it is…`);
  }

  const result = await Discover.discover({
    baseUrl,
    token: TOKEN,
    name: flag("name", null),
    fetchImpl: globalThis.fetch,
    allowNetwork: !OFFLINE,
    cached: cached && !has("rediscover") ? cached : null,
  });

  for (const line of result.log) say(`   · ${line}`);

  if (!result.spec) {
    say(`\n❌ I could not work that API out.`);
    if (result.tier === "offline") {
      say("   No internet, so I could not look for a published description — everything I tried was on the local network.");
      say("   Either connect this Pi to the internet and try again, or describe the API yourself with Skills.restSpec().");
    } else {
      say("   It publishes no machine-readable description, and nothing it returned looked like a list of things.");
    }
    process.exit(1);
  }

  say(`\n✅ Worked it out via ${result.tier} (confidence ${(result.confidence * 100).toFixed(0)}%).`);
  if (result.unknown.length) {
    say(`   Still unsure about: ${result.unknown.join(", ")} — I will not guess at those.`);
  }

  // Remember it, so this works with no network next time.
  fs.mkdirSync(SPEC_DIR, { recursive: true });
  fs.writeFileSync(specFileFor(result.spec.id), JSON.stringify(result.spec, null, 1));

  const source = Skills.generateAdapter(result.spec);
  fs.mkdirSync(SKILL_DIR, { recursive: true });
  const file = path.join(SKILL_DIR, `${result.spec.id}.js`);
  fs.writeFileSync(file, source);
  say(`✍️  Wrote a ${source.trim().split("\n").length}-line adapter → ${path.relative(process.cwd(), file)}`);

  if (has("show-code")) {
    say("\n" + "─".repeat(70));
    say(source);
    say("─".repeat(70) + "\n");
  }

  return Skills.compile(source, { token: TOKEN }, globalThis.fetch);
}

/** Write the adapter if she has not already, and load it. */
function getAdapter() {
  const spec = Skills.homeAssistantSpec(URL_ARG);
  let source;

  if (fs.existsSync(SKILL_FILE) && !has("rewrite")) {
    source = fs.readFileSync(SKILL_FILE, "utf8");
    say(`🧠 Using the adapter Eve wrote earlier — ${path.relative(process.cwd(), SKILL_FILE)}`);
    // The base URL is baked into the generated source; if it changed, rewrite.
    if (!source.includes(JSON.stringify(spec.baseUrl))) {
      say("   (the address changed, so she is rewriting it)");
      source = null;
    }
  }

  if (!source) {
    say(`✍️  Eve has no code for Home Assistant. Writing an adapter…`);
    source = Skills.generateAdapter(spec);
    fs.mkdirSync(SKILL_DIR, { recursive: true });
    fs.writeFileSync(SKILL_FILE, source);
    say(`   wrote ${source.trim().split("\n").length} lines → ${path.relative(process.cwd(), SKILL_FILE)}`);
    say(`   (read it with --show-code; your token is not in it)`);
  }

  if (has("show-code")) {
    say("\n" + "─".repeat(70));
    say(source);
    say("─".repeat(70) + "\n");
  }

  return Skills.compile(source, { token: TOKEN }, globalThis.fetch);
}

/** Act on one sentence. */
async function handle(net, adapter, things, text) {
  const understood = Intent.understand(net, text, things);

  if (understood.confidence < 0.35) {
    say(`🤔 I did not follow that. Try "turn on the kitchen light", "is the fan on", or "list devices".`);
    return things;
  }

  if (understood.intent === "list_devices") {
    const controllable = things.filter((t) => t.controllable);
    say(`\n💡 ${controllable.length} things I can control (of ${things.length} entities):\n`);
    for (const thing of controllable.slice(0, 40)) {
      say(`   ${String(thing.state).padEnd(10)} ${thing.name}   ${`(${thing.id})`}`);
    }
    if (controllable.length > 40) say(`   …and ${controllable.length - 40} more`);
    say("");
    return things;
  }

  if (understood.intent === "connect") {
    const info = await adapter.probe();
    say(`🔌 Already connected — ${info.detail}.`);
    return things;
  }

  if (understood.intent === "grade_card") {
    say("🃏 Card grading lives in the browser studio (train.html) — I need a photo for that.");
    return things;
  }

  if (!understood.thing) {
    say(`🤷 I understood "${understood.intent}" but not which device. Say the name as it appears in "list devices".`);
    return things;
  }

  const result = await adapter.act(understood.intent, understood.thing, understood.number);
  if (result.done === "query_state") {
    say(`📊 ${result.thing} is ${result.state}.`);
  } else if (result.value != null) {
    say(`✅ ${result.thing} → ${result.done.replace(/_/g, " ")} ${result.value}.`);
  } else {
    say(`✅ ${result.thing} → ${result.done.replace(/_/g, " ")}.`);
  }

  // Refresh, so the next question sees the new state.
  return adapter.list();
}

/** Keep talking until Ctrl-C. */
function startChat(net, adapter, things) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "you › " });
  say('Talk to her. "list devices", "turn off the porch light", "is the fan on". Ctrl-C to stop.\n');
  rl.prompt();
  rl.on("line", async (line) => {
    const text = line.trim();
    if (text) {
      try {
        things = await handle(net, adapter, things, text);
      } catch (err) {
        say(`❌ ${err.message}`);
      }
    }
    rl.prompt();
  });
  rl.on("close", () => say("\nBye."));
}

async function main() {
  if (API_ARG) {
    say("🧠 Eve — working out an API on her own.\n");
    const net = loadOrTrainIntent();
    const adapter = await discoverApi(API_ARG);
    let things = await adapter.list();
    say(`👀 ${things.length} things found.\n`);
    if (has("list")) things = await handle(net, adapter, things, "list my devices");
    if (command) things = await handle(net, adapter, things, command);
    if (has("chat")) return startChat(net, adapter, things);
    return;
  }

  if (!URL_ARG || !TOKEN) {
    say("Eve needs to know where Home Assistant is and how to authenticate.\n");
    say("  node eve-connect.js --url http://homeassistant.local:8123 --token YOUR_TOKEN --list\n");
    say("Create a token in Home Assistant under your profile → Security →");
    say("Long-lived access tokens. Or set HA_URL and HA_TOKEN in the environment.");
    process.exit(1);
  }

  say("🧠 Eve — learning to speak to your house.\n");

  const net = loadOrTrainIntent();

  const adapter = getAdapter();

  let info;
  try {
    info = await adapter.probe();
  } catch (err) {
    say(`\n❌ Could not reach Home Assistant: ${err.message}`);
    say("   Check the address, that the token is a long-lived access token, and that the Pi can see the host.");
    process.exit(1);
  }
  say(`🔌 Connected to ${info.detail}`);

  let things = await adapter.list();
  say(`👀 Found ${things.length} entities, ${things.filter((t) => t.controllable).length} of them controllable.\n`);

  if (has("list")) {
    things = await handle(net, adapter, things, "list my devices");
    if (!has("chat") && !command) return;
  }

  if (command) {
    things = await handle(net, adapter, things, command);
    if (!has("chat")) return;
  }

  if (has("chat") || (!command && !has("list"))) startChat(net, adapter, things);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
