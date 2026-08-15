/* EVE — the page you talk to her on.
 *
 * There is no API key here, no provider and no settings, because there is
 * nothing to configure. Everything happens in this browser, on this device.
 *
 * Two things run on this page: the conversation, where she works out what you
 * meant and writes code for services she has never met; and her learning,
 * where she is scored against sentence shapes withheld from her training and
 * keeps a round only when the score improves.
 */

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let trainer = null;
let training = false;
let stopRequested = false;
let haSkill = null;      // { adapter, source, spec }
let haThings = [];
let lastUnderstood = null;

const pct = (v) => (v == null ? "–" : `${(v * 100).toFixed(1)}%`);

// ---------------------------------------------------------------------------
// Boot — load her mind, or train a starting one if the file is missing
// ---------------------------------------------------------------------------
async function loadEve() {
  const yours = Learn.loadNet();
  if (yours) {
    startTrainer(yours.net, yours.stats);
    setHost("🧠 This is your EVE — trained further on this machine.");
    return;
  }

  try {
    const res = await fetch("eve-intent.json", { cache: "no-store" });
    if (res.ok) {
      const net = Intent.fromJSON(await res.json());
      if (net) {
        startTrainer(net, {});
        setHost("📦 The EVE this site ships with. Train her and she becomes yours.");
        return;
      }
      // fromJSON returns null when the intent list changed — retrain rather
      // than answer with labels that no longer mean anything.
    }
  } catch { /* offline or missing — train one here */ }

  setStatus("Her mind file is missing or out of date — building one…", false, true);
  await Learn.yieldToUI();
  startTrainer(Learn.trainBaseline().net, {});
  setHost("🌱 Built fresh in this browser, because the shipped file did not fit.");
  setStatus("");
}

function startTrainer(net, stats) {
  /* The browser cannot read the machine's specs the way the CLI can, so she
   * sizes the work by what the browser will tell her: cores, and memory if
   * this browser reports it at all (Safari and Firefox do not). */
  trainer = new Learn.Trainer(net, stats, Learn.loadCorrections(), browserEffort());
  if (trainer.best == null) trainer.best = Learn.assess(net);
  render();
  drawHistory();
}

/**
 * What this browser will admit about the machine.
 *
 * navigator.deviceMemory is Chromium-only and rounded; hardwareConcurrency is
 * widely supported. Both absent means an unknown machine, which Learn treats
 * as an ordinary one rather than guessing high and freezing a small board.
 */
function browserEffort() {
  const cores = navigator.hardwareConcurrency || null;
  const memoryMb = navigator.deviceMemory ? navigator.deviceMemory * 1024 : null;
  let klass = null;
  if (cores) {
    if (cores <= 2 || (memoryMb && memoryMb <= 2048)) klass = "constrained";
    else if (cores >= 8 && (!memoryMb || memoryMb >= 8192)) klass = "roomy";
    else klass = "modest";
  }
  return Learn.effortFor({ class: klass, resources: { cores, memoryMb } });
}

function setHost(text) { $("hostLine").textContent = text; }

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  const s = trainer.stats();
  $("statUnderstanding").textContent = pct(s.accuracy);
  $("statGen").textContent = s.generation;
  $("statCorrections").textContent = s.corrections;
  $("statSkills").textContent = Skills.loadSkills().length;
  $("statUnseen").textContent = pct(s.accuracy);
  $("statKept").textContent = s.keptRounds;
  $("statRejected").textContent = s.rejectedRounds;

  // How she does on the phrasings she was actually trained on — shown beside
  // the honest number so the gap between them is visible rather than hidden.
  const { train } = Learn.splitTemplates();
  $("statFamiliar").textContent = pct(Learn.accuracy(trainer.net, Learn.expand(train, 4242)));

  const e = trainer.effort;
  $("effortLine").textContent =
    `Sized to this machine: ${e.cores ? `${e.cores} cores` : "unknown cores"}` +
    `${e.memoryMb ? `, ${(e.memoryMb / 1024).toFixed(0)}GB` : ""} — ${e.label}. ` +
    `Each round: ${e.epochs} epochs, ${e.fills} device names per phrasing, ${e.variations} reworded ${e.variations === 1 ? "copy" : "copies"}.`;
}

function drawHistory() {
  const canvas = $("lossCanvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const history = trainer.stats().history;
  const pad = 34;
  const style = getComputedStyle(document.body);
  const ink = style.getPropertyValue("--text") || "#e8ecf4";
  const good = style.getPropertyValue("--good") || "#39d98a";
  const bad = style.getPropertyValue("--bad") || "#ff6b6b";

  // Axis
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 8); ctx.lineTo(pad, h - pad); ctx.lineTo(w - 8, h - pad);
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.font = "11px system-ui, sans-serif";
  ctx.globalAlpha = 0.6;
  ctx.fillText("100%", 4, 14);
  ctx.fillText("0%", 12, h - pad + 4);
  ctx.fillText("her score on shapes she has never seen", pad + 8, h - 10);
  ctx.globalAlpha = 1;

  if (!history.length) return;

  const x = (i) => pad + (history.length === 1 ? 0 : (i / (history.length - 1)) * (w - pad - 16));
  const y = (v) => (h - pad) - v * (h - pad - 14);

  // The line only ever tracks her best, so it cannot go down.
  ctx.strokeStyle = good.trim() || "#39d98a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let best = 0;
  history.forEach((p, i) => {
    best = Math.max(best, p.accuracy);
    if (i === 0) ctx.moveTo(x(i), y(best)); else ctx.lineTo(x(i), y(best));
  });
  ctx.stroke();

  // Each round as a dot: kept or rejected, at the score it actually got.
  history.forEach((p, i) => {
    ctx.fillStyle = p.kept ? (good.trim() || "#39d98a") : (bad.trim() || "#ff6b6b");
    ctx.globalAlpha = p.kept ? 1 : 0.5;
    ctx.beginPath();
    ctx.arc(x(i), y(p.accuracy), p.kept ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function setStatus(msg, isError = false, busy = false) {
  const el = $("trainStatus");
  el.classList.toggle("error", isError);
  el.innerHTML = busy ? `<span class="spinner"></span>${msg}` : msg;
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------
async function trainRound() {
  const result = trainer.round();
  Learn.saveNet(trainer.net, trainer.stats());
  render();
  drawHistory();

  setStatus(result.kept
    ? `✅ Generation ${result.generation}: ${pct(result.accuracy)} on ${result.testedOn} sentences she has never seen — kept.`
    : `↩️ Generation ${result.generation}: ${pct(result.accuracy)}, below her best of ${pct(result.best)} — thrown away.`);
  await Learn.yieldToUI();
  return result;
}

async function trainForever() {
  training = true;
  stopRequested = false;
  $("trainOnceBtn").disabled = true;
  $("trainForeverBtn").disabled = true;
  $("stopBtn").disabled = false;

  let n = 0;
  while (!stopRequested) {
    await trainRound();
    n++;
    $("progressFill").style.width = `${((n % 10) / 10) * 100}%`;
    await new Promise((r) => setTimeout(r, 30));
  }

  training = false;
  $("trainOnceBtn").disabled = false;
  $("trainForeverBtn").disabled = false;
  $("stopBtn").disabled = true;
  $("progressFill").style.width = "0%";
}

$("trainOnceBtn").addEventListener("click", async () => {
  if (training) return;
  $("trainOnceBtn").disabled = true;
  setStatus("Practising…", false, true);
  await Learn.yieldToUI();
  await trainRound();
  $("trainOnceBtn").disabled = false;
});

$("trainForeverBtn").addEventListener("click", () => { if (!training) trainForever(); });
$("stopBtn").addEventListener("click", () => { stopRequested = true; setStatus("Stopped."); });

// ---------------------------------------------------------------------------
// Her mind is a file
// ---------------------------------------------------------------------------
$("exportModel").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(Intent.toJSON(trainer.net))], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "eve-intent.json";
  a.click();
  URL.revokeObjectURL(a.href);
  $("fileStatus").textContent = "Exported. Copy it to the Pi and keep training there.";
});

$("importModelBtn").addEventListener("click", () => $("importModel").click());
$("importModel").addEventListener("change", async () => {
  const file = $("importModel").files[0];
  if (!file) return;
  try {
    const net = Intent.fromJSON(JSON.parse(await file.text()));
    if (!net) throw new Error("That file does not match this version of her.");
    startTrainer(net, {});
    Learn.saveNet(trainer.net, trainer.stats());
    $("fileStatus").textContent = "Imported.";
  } catch (err) {
    $("fileStatus").textContent = `❌ ${err.message}`;
  }
});

$("resetModel").addEventListener("click", () => {
  Learn.forget();
  startTrainer(Learn.newNet(), {});
  setHost("🌱 A brand-new EVE with random weights — she understands nothing yet.");
  $("fileStatus").textContent = "She has been started over. Train her and watch the line climb.";
});

// ---------------------------------------------------------------------------
// Capability map
// ---------------------------------------------------------------------------
function renderCapabilities() {
  const skills = Skills.loadSkills();
  const rows = [
    ["Understanding what you say", trainer ? `${pct(trainer.best)} on unseen phrasings` : "–", true],
    ["Writing API adapters", skills.length ? `${skills.length} written` : "ready — nothing written yet", true],
    ["Working out an API on her own", "three tiers: spec, response shapes, web", true],
    ["Recognising objects you teach her", "in her eye", true],
    ["Holding a conversation", "unsupported — no language model", false],
    ["Programming arbitrary software", "unsupported — adapters only", false],
    ["Naming an object never shown to her", "unsupported — and she says so", false],
  ];

  $("capabilityList").innerHTML = "";
  for (const [name, detail, supported] of rows) {
    const div = document.createElement("div");
    div.className = `capability ${supported ? "yes" : "no"}`;
    div.innerHTML = `<span class="capability-name">${supported ? "✅" : "🚫"} ${name}</span><span class="capability-detail"></span>`;
    div.querySelector(".capability-detail").textContent = detail;
    $("capabilityList").appendChild(div);
  }
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------
function chatSay(text, who = "eve", thinking = false) {
  const div = document.createElement("div");
  div.className = `chat-msg ${who}${thinking ? " thinking" : ""}`;
  div.textContent = text;
  $("chatLog").appendChild(div);
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
  return div;
}

function restoreSkillSource() {
  return Skills.loadSkills().find((s) => s.spec.id === "home_assistant") || null;
}

function showSkillCode(source) {
  $("skillCode").textContent = source;
  $("skillCodeWrap").classList.remove("hidden");
}

/** Show what she understood, so a wrong reading can be corrected rather than guessed at. */
function showUnderstanding(understood) {
  lastUnderstood = understood;
  const select = $("correctIntent");
  if (!select.options.length) {
    for (const name of Intent.INTENT_NAMES) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name.replace(/_/g, " ");
      select.appendChild(opt);
    }
  }
  select.value = understood.intent === "unknown" ? Intent.INTENT_NAMES[0] : understood.intent;
  $("understoodLine").textContent = understood.intent === "unknown"
    ? `She did not recognise that (best guess "${understood.ranked[0].intent.replace(/_/g, " ")}" at ${pct(understood.confidence)}, below her 35% threshold).`
    : `She read that as "${understood.intent.replace(/_/g, " ")}" at ${pct(understood.confidence)} confidence.`;
  $("understanding").classList.remove("hidden");
}

$("saveCorrection").addEventListener("click", () => {
  if (!lastUnderstood) return;
  const corrections = Learn.saveCorrection({ text: lastUnderstood.text, intent: $("correctIntent").value });
  trainer.corrections = corrections;
  render();
  chatSay(`Noted — "${lastUnderstood.text}" means "${$("correctIntent").value.replace(/_/g, " ")}". I'll practise that in every round from now on.`);
  $("understanding").classList.add("hidden");
});

async function connectHomeAssistant(url, token) {
  const spec = Skills.homeAssistantSpec(url);
  const existing = restoreSkillSource();
  let source;

  if (existing && existing.source.includes(JSON.stringify(spec.baseUrl))) {
    source = existing.source;
    chatSay("I already wrote code for this one — reusing my adapter.");
  } else {
    const note = chatSay("I don't have code for Home Assistant yet. Writing it now…", "eve", true);
    await Learn.yieldToUI();
    source = Skills.generateAdapter(spec);
    note.remove();
    chatSay(`Done — I wrote a ${source.trim().split("\n").length}-line adapter for the Home Assistant REST API. It's shown below; your token is not in it.`);
  }
  showSkillCode(source);

  const adapter = Skills.compile(source, { token });
  const info = await adapter.probe();
  haSkill = { adapter, source, spec };
  Skills.saveSkill({ spec, source, writtenAt: new Date().toISOString(), lines: source.trim().split("\n").length });
  render();
  renderCapabilities();

  haThings = await adapter.list();
  const controllable = haThings.filter((t) => t.controllable).length;
  chatSay(`Connected to ${info.detail}. I can see ${haThings.length} entities and control ${controllable} of them. Ask me to list devices, or just tell me what to switch.`);
}

async function handleChat(text) {
  chatSay(text, "you");
  const understood = Intent.understand(trainer.net, text, haThings);
  showUnderstanding(understood);

  try {
    if (understood.intent === "unknown") {
      chatSay(`I didn't follow that. Try "hello", "what can you do", or — once I'm connected to something — "turn on the kitchen light". If I should have understood that, correct me just above.`);
      return;
    }

    if (understood.intent === "greeting") {
      chatSay(`Hello. I'm EVE. Ask me what I can do, or just talk to me.`);
      return;
    }

    if (understood.intent === "identity") {
      chatSay(
        `I'm EVE — an emergent virtual entity.\n` +
        `I was written from scratch: no libraries, no pretrained model, nothing downloaded. Every part of me is code on this machine.\n` +
        `I understand what you say at ${pct(trainer.best)} on phrasings I was never trained on, I can see through a camera, I can learn your voice, and I write my own code for services I have never met.`
      );
      return;
    }

    if (understood.intent === "thanks") {
      chatSay(`You're welcome.`);
      return;
    }

    if (understood.intent === "goodbye") {
      chatSay(`Goodbye. I'll be here.`);
      return;
    }

    if (understood.intent === "what_can_you_do") {
      const skills = Skills.loadSkills();
      chatSay(
        `I understand what you say at ${pct(trainer.best)} on phrasings I was never trained on, and I get better at it every round you run.\n` +
        `I've written ${skills.length} adapter${skills.length === 1 ? "" : "s"} so far.\n` +
        `I can work out an API from its own description and write the code to use it.\n` +
        `I can't hold a conversation — there's no language model in me — and I can't name an object nobody showed me.`
      );
      return;
    }

    if (understood.intent === "connect") {
      $("connectForm").classList.remove("hidden");
      const existing = restoreSkillSource();
      chatSay(existing
        ? "I've written this adapter before — enter the address and token below and I'll reuse or update it."
        : "I can teach myself the Home Assistant API. Give me the address and a long-lived access token below, and I'll write the adapter and show you the code before using it.");
      $("haUrl").focus();
      return;
    }

    if (!haSkill) {
      chatSay(`That sounds like a device request, but I'm not connected to anything yet. Say "connect to home assistant" and I'll write the code for it.`);
      return;
    }

    if (understood.intent === "list_devices") {
      const controllable = haThings.filter((t) => t.controllable);
      const lines = controllable.slice(0, 25).map((t) => `• ${t.name} — ${t.state}`);
      if (controllable.length > 25) lines.push(`…and ${controllable.length - 25} more`);
      chatSay(lines.length ? `Here's what I can control:\n${lines.join("\n")}` : "I connected, but found nothing I can control.");
      return;
    }

    if (!understood.thing) {
      chatSay(`I understood "${understood.intent.replace(/_/g, " ")}" but couldn't match a device. Say the name as it appears when I list devices.`);
      return;
    }

    const result = await haSkill.adapter.act(understood.intent, understood.thing, understood.number);
    if (result.done === "query_state") {
      chatSay(`${result.thing} is ${result.state}.`);
    } else {
      chatSay(`Done — ${result.thing}: ${result.done.replace(/_/g, " ")}${result.value != null ? ` ${result.value}` : ""}.`);
    }
    haThings = await haSkill.adapter.list();
  } catch (err) {
    chatSay(`That didn't work: ${err.message}`, "eve");
  }
}

$("chatSend").addEventListener("click", () => {
  const text = $("chatInput").value.trim();
  if (!text) return;
  $("chatInput").value = "";
  handleChat(text);
});
$("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("chatSend").click(); });

$("haConnect").addEventListener("click", async () => {
  const url = $("haUrl").value.trim();
  const token = $("haToken").value.trim();
  if (!url || !token) {
    chatSay("I need both the address and a token to connect.");
    return;
  }
  $("haConnect").disabled = true;
  try {
    await connectHomeAssistant(url, token);
    $("connectForm").classList.add("hidden");
  } catch (err) {
    chatSay(`I couldn't connect: ${err.message} — if this is the browser, it may be CORS; add this site to http.cors_allowed_origins in Home Assistant's configuration.yaml, or run "node eve-connect.js --chat" on the Pi instead, which has no CORS at all.`);
  } finally {
    $("haConnect").disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------
(async () => {
  await loadEve();
  renderCapabilities();
  const existing = restoreSkillSource();
  if (existing) showSkillCode(existing.source);
  chatSay(`I'm EVE. Ask me to "connect to home assistant" and I'll write the code for it myself — or ask "what can you do".`);
})();

// ---------------------------------------------------------------------------
// Her ears and her eye, at the same time
// ---------------------------------------------------------------------------
const ears = new VoiceKit.Ears({
  onPartial: (text) => { $("heardLine").textContent = `… ${text}`; },
  onHeard: (text) => {
    $("heardLine").textContent = `“${text}”`;
    $("chatInput").value = "";
    handleChat(text);
  },
  onState: ({ listening, error }) => {
    $("listenBtn").textContent = listening ? "🎙️ Stop listening" : "🎙️ Start listening";
    $("listenBtn").classList.toggle("active", listening);
    if (error) $("voiceNote").textContent = `⚠️ ${error}`;
    else if (listening) $("voiceNote").textContent = "Listening. Say something like “turn on the kitchen light”.";
    if (!listening && !error) $("heardLine").textContent = "Not listening.";
  },
});

const voice = new VoiceKit.Voice();
const watching = new VoiceKit.Watching({
  video: $("voiceVideo"),
  canvas: $("voiceCanvas"),
  onScene: (scene, report) => {
    /* Say what she can actually tell, and say plainly when she cannot tell
     * anything — a confident description of a covered lens is a lie. */
    $("sceneLine").textContent = report.usable
      ? `👁️ ${report.summary}`
      : `👁️ ${report.why || "I cannot see well enough to say."}`;
  },
});

$("listenBtn").addEventListener("click", () => {
  if (!VoiceKit.Ears.available) {
    $("voiceNote").textContent = `⚠️ ${VoiceKit.Ears.reason}`;
    return;
  }
  try { ears.toggle(); }
  catch (err) { $("voiceNote").textContent = `⚠️ ${err.message}`; }
});

$("watchBtn").addEventListener("click", async () => {
  if (watching.running) {
    watching.stop();
    $("watchBtn").textContent = "👁️ Open her eye";
    $("sceneLine").textContent = "Her eye is closed.";
    return;
  }
  try {
    await watching.start();
    $("watchBtn").textContent = "👁️ Close her eye";
  } catch (err) {
    $("sceneLine").textContent = `⚠️ ${err.message}`;
  }
});

$("speakBack").addEventListener("change", (e) => {
  voice.enabled = e.target.checked && VoiceKit.Voice.available;
  if (e.target.checked && !VoiceKit.Voice.available) {
    $("voiceNote").textContent = "⚠️ This browser cannot speak. Everything else still works.";
    e.target.checked = false;
  }
});

/* Anything she says in the chat is also said aloud, if you asked for that.
 * Wrapping chatSay rather than editing every call site keeps the two concerns
 * apart — the conversation does not need to know a speaker exists. */
const chatSayText = chatSay;
chatSay = function (text, who = "eve", thinking = false) {
  const node = chatSayText(text, who, thinking);
  if (who === "eve" && !thinking) voice.say(text);
  return node;
};

if (!VoiceKit.Ears.available) $("voiceNote").textContent = `ℹ️ ${VoiceKit.Ears.reason}`;

// ---------------------------------------------------------------------------
// Her own ears — the ones that work inside the app
// ---------------------------------------------------------------------------
const localEars = VoiceKit.LocalEars.available ? new VoiceKit.LocalEars({}) : null;

function showPhrases() {
  if (!localEars) return;
  const names = localEars.phrases;
  $("phraseList").textContent = names.length
    ? `She knows: ${names.map((n) => `“${n}”`).join(", ")}.`
    : "She knows no spoken commands yet. Teach her one — say it five or six times.";
}

/** A spoken phrase is just another way of typing it, so it goes the same route. */
async function actOnPhrase(phrase) {
  $("heardLine").textContent = `“${phrase}”`;
  await handleChat(phrase);
}

if (localEars) {
  $("teachPhraseBtn").addEventListener("click", async () => {
    const phrase = prompt("What should she learn to hear?\n\nType it the way you would type it to her, e.g. “turn on the kitchen light”.");
    if (!phrase) return;
    const btn = $("teachPhraseBtn");
    btn.disabled = true;
    btn.classList.add("active");
    btn.textContent = "🔴 Say it now…";
    try {
      const result = await localEars.teach(phrase.trim());
      $("voiceNote").textContent = result.ok
        ? `Heard it — “${result.phrase}” now has ${result.examples} example${result.examples === 1 ? "" : "s"}. ` +
          `${result.examples < 5 ? "Do that a few more times; five or six is where she becomes reliable." : "That is enough to be reliable."}`
        : `⚠️ ${result.why}`;
      showPhrases();
    } catch (err) {
      $("voiceNote").textContent = `⚠️ ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.classList.remove("active");
      btn.textContent = "🎧 Teach her a spoken command";
    }
  });

  $("hearBtn").addEventListener("click", async () => {
    const btn = $("hearBtn");
    btn.disabled = true;
    btn.classList.add("active");
    btn.textContent = "🔴 Listening…";
    try {
      const result = await localEars.listenOnce();
      if (result.phrase) {
        $("voiceNote").textContent = `Heard “${result.phrase}” (${(result.confidence * 100).toFixed(0)}% sure).`;
        await actOnPhrase(result.phrase);
      } else {
        $("voiceNote").textContent = `🤔 ${result.why}`;
        $("heardLine").textContent = result.why;
      }
    } catch (err) {
      $("voiceNote").textContent = `⚠️ ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.classList.remove("active");
      btn.textContent = "👂 Listen (her own ears)";
    }
  });

  showPhrases();
} else {
  $("teachPhraseBtn").disabled = true;
  $("hearBtn").disabled = true;
  $("phraseList").textContent = "This browser will not give a page a microphone here.";
}

/* Browser dictation is the optional extra, not the main event, so its absence
 * is stated as a limitation of the browser rather than of her. */
if (!VoiceKit.Ears.available) {
  $("listenBtn").disabled = true;
  $("listenBtn").title = VoiceKit.Ears.reason;
}
