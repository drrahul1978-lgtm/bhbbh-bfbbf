/* train.js — Eve's studio: watch her learn, test her, and teach her.
 * Everything here runs on this device. Nothing is uploaded anywhere. */

const $ = (id) => document.getElementById(id);
const KEYS = Eve.KEYS;
const LABELS = { centering: "📐 Centering", corners: "📍 Corners", edges: "📏 Edges", surface: "✨ Surface" };

const EFFORT = {
  pi: { cardsPerRound: 60, epochsPerRound: 15, validationSize: 120 },
  balanced: { cardsPerRound: 150, epochsPerRound: 25, validationSize: 200 },
  desktop: { cardsPerRound: 400, epochsPerRound: 40, validationSize: 300 },
};

let trainer = null;
/* The second opinion. Loaded alongside the first; when she is here the two of
 * them argue it out and the disagreement becomes the confidence. */
let secondEve = null;
let stopRequested = false;
let lastResult = null;
let testFeatures = null;

// ---------------------------------------------------------------------------
// Boot: find Eve, in order of preference
// ---------------------------------------------------------------------------
async function boot() {
  const saved = Eve.loadModel();
  if (saved) {
    startTrainer(saved.net, saved.stats);
    $("modelOrigin").innerHTML =
      `🧠 Loaded <strong>your</strong> Eve from this browser — generation ${saved.stats.generation || 0}, ` +
      `trained on ${(saved.stats.cardsSeen || 0).toLocaleString()} cards.`;
    return;
  }

  // No local Eve yet — try the one shipped with the site as a starting point.
  try {
    const res = await fetch("eve-model.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const file = await res.json();
    if (file.featureCount !== Vision.FEATURE_COUNT) throw new Error("feature mismatch");
    const net = NN.Net.fromJSON(file.net);
    startTrainer(net, {
      generation: file.stats?.generation || 0,
      cardsSeen: file.stats?.cardsSeen || 0,
      bestMAE: file.stats?.validationMAE ?? null,
      perKey: file.stats?.perKey || null,
      history: [],
    });
    $("modelOrigin").innerHTML =
      `🧠 Started from the Eve shipped with this site (trained on ${(file.stats?.cardsSeen || 0).toLocaleString()} cards). ` +
      `Train her here and she becomes <strong>yours</strong> — saved in this browser only.`;
  } catch {
    startTrainer(Eve.newNet(), {});
    $("modelOrigin").innerHTML =
      "🌱 Brand-new Eve with random weights — she knows nothing yet. Hit <strong>Train one round</strong> to begin.";
  }
}

function startTrainer(net, stats) {
  trainer = new Eve.Trainer({
    net,
    stats,
    ...EFFORT[$("effort").value],
    onProgress: onProgress,
    onRound: onRound,
  });
  refreshStats();
  drawBrain();
  drawLossCurve();
}

// ---------------------------------------------------------------------------
// Stats & charts
// ---------------------------------------------------------------------------
function refreshStats() {
  const s = trainer.stats;
  $("statMae").textContent = s.bestMAE == null ? "–" : s.bestMAE.toFixed(2);
  $("statGen").textContent = s.generation || 0;
  $("statCards").textContent = (s.cardsSeen || 0).toLocaleString();
  $("statCorrections").textContent = Eve.loadCorrections().length;

  if (s.perKey) {
    for (const el of document.querySelectorAll("#perKeyBars .subgrade")) {
      const i = KEYS.indexOf(el.dataset.key);
      const err = s.perKey[i];
      // 0 error = full bar, 3+ grade points off = empty.
      const pct = Math.max(0, Math.min(100, (1 - err / 3) * 100));
      el.querySelector(".subgrade-value").textContent = `±${err.toFixed(2)}`;
      const fill = el.querySelector(".bar-fill");
      fill.style.width = `${pct}%`;
      fill.style.background = pct > 70 ? "var(--good)" : pct > 40 ? "var(--mid)" : "var(--bad)";
    }
  }
}

/** A little picture of Eve: her actual layer sizes, sampled so it stays legible. */
function drawBrain(activity = 0) {
  const canvas = $("brainCanvas");
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  const sizes = trainer.net.sizes;
  const shown = sizes.map((n) => Math.min(n, 9));
  const layerX = shown.map((_, i) => 34 + (i * (w - 68)) / (shown.length - 1));
  const nodeY = (count, i) => (h / 2) + (i - (count - 1) / 2) * Math.min(20, (h - 40) / count);

  ctx.lineWidth = 0.6;
  for (let l = 0; l < shown.length - 1; l++) {
    for (let a = 0; a < shown[l]; a++) {
      for (let b = 0; b < shown[l + 1]; b++) {
        const pulse = Math.sin(activity * 3 + a * 0.7 + b * 0.5 + l) * 0.5 + 0.5;
        ctx.strokeStyle = `rgba(61,125,202,${0.06 + pulse * activity * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(layerX[l], nodeY(shown[l], a));
        ctx.lineTo(layerX[l + 1], nodeY(shown[l + 1], b));
        ctx.stroke();
      }
    }
  }
  shown.forEach((count, l) => {
    for (let i = 0; i < count; i++) {
      const pulse = Math.sin(activity * 3 + i + l) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(layerX[l], nodeY(count, i), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = l === 0 ? "#3d7dca" : l === shown.length - 1 ? "#ffcb05" : `rgba(147,160,191,${0.55 + pulse * activity * 0.45})`;
      ctx.fill();
    }
    ctx.fillStyle = "#93a0bf";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(sizes[l]), layerX[l], h - 8);
  });
  ctx.fillStyle = "#93a0bf";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("what she sees → what she thinks → her grades", w / 2, 14);
}

/** Her error over time. Only improvements are recorded, so it only falls. */
function drawLossCurve() {
  const canvas = $("lossCanvas");
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const history = trainer.stats.history || [];

  const pad = { l: 42, r: 14, t: 14, b: 26 };
  ctx.strokeStyle = "#2a3350";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, h - pad.b);
  ctx.lineTo(w - pad.r, h - pad.b);
  ctx.stroke();

  ctx.fillStyle = "#93a0bf";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "right";

  if (history.length < 2) {
    ctx.textAlign = "center";
    ctx.fillText("Train a round or two and Eve's progress appears here.", w / 2, h / 2);
    return;
  }

  const values = history.map((p) => p.mae);
  const rounds = history.map((p) => (p.roundMAE == null ? p.mae : p.roundMAE));
  const max = Math.max(...values, ...rounds) * 1.05;
  const min = Math.min(...values, ...rounds) * 0.95;
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / (history.length - 1);
  const y = (v) => h - pad.b - ((v - min) / (max - min || 1)) * (h - pad.t - pad.b);

  for (let g = 0; g <= 3; g++) {
    const v = min + ((max - min) * g) / 3;
    ctx.strokeStyle = "rgba(42,51,80,0.6)";
    ctx.beginPath();
    ctx.moveTo(pad.l, y(v));
    ctx.lineTo(w - pad.r, y(v));
    ctx.stroke();
    ctx.fillStyle = "#93a0bf";
    ctx.fillText(v.toFixed(2), pad.l - 6, y(v) + 4);
  }

  const gradient = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  gradient.addColorStop(0, "rgba(255,203,5,0.25)");
  gradient.addColorStop(1, "rgba(255,203,5,0)");
  ctx.beginPath();
  ctx.moveTo(x(0), y(values[0]));
  values.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(values.length - 1), h - pad.b);
  ctx.lineTo(x(0), h - pad.b);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Every round's raw score, including the ones that were thrown away — the
  // scatter above the line is the work that did not make the cut.
  rounds.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(v), 2.2, 0, Math.PI * 2);
    ctx.fillStyle = history[i].improved ? "rgba(61,220,132,0.85)" : "rgba(147,160,191,0.45)";
    ctx.fill();
  });

  ctx.beginPath();
  values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.strokeStyle = "#ffcb05";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffcb05";
  ctx.beginPath();
  ctx.arc(x(values.length - 1), y(values[values.length - 1]), 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#93a0bf";
  ctx.textAlign = "center";
  ctx.fillText("generations of Eve →", w / 2, h - 6);
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------
function onProgress(p) {
  const pct = (p.done / p.total) * 100;
  $("progressFill").style.width = `${pct}%`;
  $("trainStatus").innerHTML = p.phase === "drawing"
    ? `<span class="spinner"></span>Drawing practice cards… ${p.done}/${p.total}`
    : `<span class="spinner"></span>Learning… epoch ${p.done}/${p.total}${p.loss ? ` · error ${p.loss.toFixed(4)}` : ""}`;
  drawBrain(performance.now() / 400);
}

function onRound(r) {
  refreshStats();
  drawLossCurve();
  drawBrain(0);
  $("progressFill").style.width = "0%";
  $("trainStatus").innerHTML = r.improved
    ? `✅ Generation ${r.generation}: improved to <strong>${r.mae.toFixed(3)}</strong> grade points off.`
    : `↩️ Generation ${r.generation}: scored ${r.mae.toFixed(3)}, worse than her best (${trainer.stats.bestMAE.toFixed(3)}) — rolled back.`;
}

function setBusy(busy) {
  $("trainOnceBtn").disabled = busy;
  $("trainForeverBtn").disabled = busy;
  $("stopBtn").disabled = !busy;
  $("effort").disabled = busy;
}

$("trainOnceBtn").addEventListener("click", async () => {
  setBusy(true);
  stopRequested = false;
  await trainer.runRound(() => stopRequested);
  setBusy(false);
});

$("trainForeverBtn").addEventListener("click", async () => {
  setBusy(true);
  stopRequested = false;
  await trainer.runForever(() => stopRequested);
  setBusy(false);
  $("trainStatus").textContent = "Stopped.";
});

$("stopBtn").addEventListener("click", () => {
  stopRequested = true;
  $("trainStatus").textContent = "Finishing the current step…";
});

$("effort").addEventListener("change", () => {
  Object.assign(trainer, EFFORT[$("effort").value]);
  trainer.validation = null; // rebuilt at the new size on the next round
});

// ---------------------------------------------------------------------------
// Practice-card gallery
// ---------------------------------------------------------------------------
function drawSamples() {
  const strip = $("sampleStrip");
  strip.innerHTML = "";
  const rand = NN.mulberry32((Math.random() * 1e9) >>> 0);
  for (let i = 0; i < 6; i++) {
    const card = Synth.generateCard(rand, { severity: i / 5 });
    const canvas = document.createElement("canvas");
    canvas.width = card.image.width;
    canvas.height = card.image.height;
    canvas.className = "sample-card";
    const imageData = new ImageData(card.image.data, card.image.width, card.image.height);
    canvas.getContext("2d").putImageData(imageData, 0, 0);

    const wrap = document.createElement("figure");
    wrap.className = "sample";
    wrap.appendChild(canvas);
    const caption = document.createElement("figcaption");
    caption.innerHTML = `<strong>${card.grades.overall.toFixed(1)}</strong> ${Synth.gradeLabel(card.grades.overall)}`;
    wrap.appendChild(caption);
    strip.appendChild(wrap);
  }
}
$("redrawSamples").addEventListener("click", drawSamples);

// ---------------------------------------------------------------------------
// Grading a real photo
// ---------------------------------------------------------------------------
function imageToData(img) {
  // Cap the working size: a Pi should not chew through a 12-megapixel photo,
  // and damage is still plainly visible at this resolution.
  const MAX = 700;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function gradeWithEve(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      $("testPreview").src = img.src;
      $("testPreview").classList.remove("hidden");
      $("testPlaceholder").classList.add("hidden");

      const result = Eve.grade(trainer.net, imageToData(img), secondEve);
      lastResult = result;
      testFeatures = result.features;
      renderEveResult(result);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function renderEveResult(r) {
  $("eveResult").classList.remove("hidden");
  $("eveGrade").textContent = r.overall.toFixed(1);
  $("eveLabel").textContent = r.label;
  $("eveMeta").textContent = KEYS.map((k) => `${LABELS[k].split(" ")[1]} ${r[k].toFixed(1)}`).join(" · ");

  const notes = $("eveNotes");
  notes.innerHTML = "";
  for (const note of r.observations) {
    const li = document.createElement("li");
    li.textContent = note;
    notes.appendChild(li);
  }

  const box = $("correctionSliders");
  box.innerHTML = "";
  for (const key of KEYS) {
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML =
      `<label for="fix_${key}">${LABELS[key]}</label>` +
      `<input type="range" id="fix_${key}" min="1" max="10" step="0.5" value="${r[key].toFixed(1)}" />` +
      `<output id="out_${key}">${r[key].toFixed(1)}</output>`;
    box.appendChild(row);
    row.querySelector("input").addEventListener("input", (e) => {
      $(`out_${key}`).textContent = Number(e.target.value).toFixed(1);
    });
  }
  $("correctionMsg").textContent = "";
}

$("testDrop").addEventListener("click", () => $("testFile").click());
$("testDrop").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") $("testFile").click();
});
$("testFile").addEventListener("change", () => gradeWithEve($("testFile").files[0]));
["dragover", "dragleave", "drop"].forEach((type) => {
  $("testDrop").addEventListener(type, (e) => {
    e.preventDefault();
    $("testDrop").classList.toggle("dragover", type === "dragover");
    if (type === "drop") gradeWithEve(e.dataTransfer.files[0]);
  });
});
document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) gradeWithEve(item.getAsFile());
});

$("saveCorrection").addEventListener("click", () => {
  if (!testFeatures) return;
  const grades = {};
  for (const key of KEYS) grades[key] = Number($(`fix_${key}`).value);
  const count = Eve.saveCorrection({
    features: Array.from(testFeatures, (v) => Math.round(v * 1000) / 1000),
    grades,
    at: new Date().toISOString(),
  });
  $("correctionMsg").textContent = `Saved — Eve now has ${count} of your card${count === 1 ? "" : "s"} to learn from.`;
  refreshStats();
});

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------
function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

$("exportModel").addEventListener("click", () => {
  download("eve-model.json", {
    name: "Eve",
    format: "gmc-net-1",
    trainedAt: new Date().toISOString(),
    featureCount: Vision.FEATURE_COUNT,
    keys: KEYS,
    stats: {
      validationMAE: trainer.stats.bestMAE,
      perKey: trainer.stats.perKey,
      cardsSeen: trainer.stats.cardsSeen,
      generation: trainer.stats.generation,
    },
    net: trainer.net.toJSON(),
  });
  $("fileStatus").textContent = "Exported eve-model.json — drop it next to the site, or onto a Pi.";
});

$("exportCorrections").addEventListener("click", () => {
  const corrections = Eve.loadCorrections();
  if (!corrections.length) {
    $("fileStatus").textContent = "No corrections saved yet — grade a card above and set the right answer.";
    return;
  }
  download("eve-corrections.json", { corrections });
  $("fileStatus").textContent = `Exported ${corrections.length} corrections — train with: node eve-train.js --corrections eve-corrections.json`;
});

$("importModelBtn").addEventListener("click", () => $("importModel").click());
$("importModel").addEventListener("change", () => {
  const file = $("importModel").files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const netJson = parsed.net || parsed;
      if (parsed.featureCount && parsed.featureCount !== Vision.FEATURE_COUNT) {
        throw new Error("that model was built for a different set of measurements");
      }
      const net = NN.Net.fromJSON(netJson);
      startTrainer(net, {
        generation: parsed.stats?.generation || 0,
        cardsSeen: parsed.stats?.cardsSeen || 0,
        bestMAE: parsed.stats?.validationMAE ?? null,
        perKey: parsed.stats?.perKey || null,
        history: [],
      });
      Eve.saveModel(net, trainer.stats);
      $("fileStatus").textContent = "Imported — Eve is now running these weights.";
      $("modelOrigin").textContent = "🧠 Running an imported Eve.";
    } catch (err) {
      $("fileStatus").textContent = `❌ Could not import: ${err.message}`;
    }
  };
  reader.readAsText(file);
});

$("resetModel").addEventListener("click", () => {
  if (!confirm("Wipe Eve's weights and her memory of your corrections, and start from random? This cannot be undone.")) return;
  localStorage.removeItem(Eve.STORAGE.model);
  localStorage.removeItem(Eve.STORAGE.stats);
  localStorage.removeItem(Eve.STORAGE.corrections);
  startTrainer(Eve.newNet((Math.random() * 1e9) >>> 0), {});
  $("modelOrigin").textContent = "🌱 Brand-new Eve with random weights — she knows nothing yet.";
  $("fileStatus").textContent = "Eve has been reset.";
});

/** Fetch the second Eve, if this site ships one. Absence is not an error. */
async function loadSecondEve() {
  if (self.debateReady) await self.debateReady;
  try {
    const res = await fetch("eve-model-two.json", { cache: "no-store" });
    if (!res.ok) return;
    const file = await res.json();
    if (file.featureCount !== Vision.FEATURE_COUNT) return;
    secondEve = NN.Net.fromJSON(file.net);
  } catch { /* one Eve is a perfectly good Eve */ }
}

// ---------------------------------------------------------------------------
loadSecondEve();
boot();
drawSamples();

// ---------------------------------------------------------------------------
// Chat — talk to Eve, and watch her write code for new APIs
// ---------------------------------------------------------------------------
let intentNet = null;
let haSkill = null;     // { adapter, source, spec }
let haThings = [];

function chatSay(text, who = "eve", thinking = false) {
  const div = document.createElement("div");
  div.className = `chat-msg ${who}${thinking ? " thinking" : ""}`;
  div.textContent = text;
  $("chatLog").appendChild(div);
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
  return div;
}

/** Her language model: load the shipped one instantly, else train in-page. */
async function ensureIntentNet() {
  if (intentNet) return intentNet;
  try {
    const res = await fetch("eve-intent.json", { cache: "no-store" });
    if (res.ok) {
      intentNet = Intent.fromJSON(await res.json());
      if (intentNet) return intentNet;
    }
  } catch { /* fall through to training */ }
  const note = chatSay("Give me a moment — learning to understand you…", "eve", true);
  await Eve.yieldToUI();
  intentNet = Intent.train().net;
  note.remove();
  return intentNet;
}

/** Reload a previously written skill (source only — the token is asked for). */
function restoreSkillSource() {
  const saved = Skills.loadSkills().find((s) => s.spec.id === "home_assistant");
  return saved || null;
}

function showSkillCode(source) {
  $("skillCode").textContent = source;
  $("skillCodeWrap").classList.remove("hidden");
}

async function connectHomeAssistant(url, token) {
  const spec = Skills.homeAssistantSpec(url);
  const existing = restoreSkillSource();
  let source;

  if (existing && existing.source.includes(JSON.stringify(spec.baseUrl))) {
    source = existing.source;
    chatSay("I already wrote code for this one — reusing my adapter.");
  } else {
    const note = chatSay("I don't have code for Home Assistant yet. Writing it now…", "eve", true);
    await Eve.yieldToUI();
    source = Skills.generateAdapter(spec);
    note.remove();
    chatSay(`Done — I wrote a ${source.trim().split("\n").length}-line adapter for the Home Assistant REST API. It's shown below; your token is not in it.`);
  }
  showSkillCode(source);

  const adapter = Skills.compile(source, { token });
  const info = await adapter.probe();
  haSkill = { adapter, source, spec };
  Skills.saveSkill({ spec, source, writtenAt: new Date().toISOString(), lines: source.trim().split("\n").length });

  haThings = await adapter.list();
  const controllable = haThings.filter((t) => t.controllable).length;
  chatSay(`Connected to ${info.detail}. I can see ${haThings.length} entities and control ${controllable} of them. Ask me to list devices, or just tell me what to switch.`);
}

async function handleChat(text) {
  chatSay(text, "you");
  const net = await ensureIntentNet();
  const understood = Intent.understand(net, text, haThings);

  try {
    if (understood.intent === "unknown") {
      chatSay(`I didn't follow that. I can grade cards, train myself, and — once connected — control your smart home: "turn on the kitchen light", "list devices", "is the fan on".`);
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

    if (understood.intent === "grade_card") {
      chatSay("Drop a photo in section 3️⃣ above and I'll grade it.");
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
$("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("chatSend").click();
});

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
    chatSay(`I couldn't connect: ${err.message} — if this is the browser, it may be CORS; add this site to http.cors_allowed_origins in Home Assistant's configuration.yaml, or run "node eve-connect.js" on the Pi instead, which has no CORS at all.`);
  } finally {
    $("haConnect").disabled = false;
  }
});

// Show any previously written skill's code on load, and greet.
(() => {
  const existing = restoreSkillSource();
  if (existing) showSkillCode(existing.source);
  chatSay(`Hi — I'm Eve. Try "connect to home assistant", or grade a card above.`);
})();
