/* eye.js — the trainer: camera in, what she sees out, and a way to teach her.
 *
 * Everything happens on this device. The camera stream never leaves the page,
 * frames are measured in memory, and what she learns is kept in this browser's
 * own storage. There is no key, no account and no upload — not as a policy, but
 * because there is no code here that could send anything anywhere.
 */

const $ = (id) => document.getElementById(id);
const eye = new Eye.Recogniser({});

let stream = null;
let lastScene = null;
let liveTimer = null;
let teaching = false;

/* Twice a second is plenty. A Pi has better things to do with its cores than
 * measure thirty frames a second that a human cannot read anyway. */
const LOOK_EVERY_MS = 500;

// ---------------------------------------------------------------- camera
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "environment" },
      audio: false,
    });
  } catch (err) {
    const why = err.name === "NotAllowedError"
      ? "You said no to the camera — allow it in your browser's address bar and try again."
      : err.name === "NotFoundError"
        ? "I cannot find a camera on this machine."
        : `The camera would not start: ${err.message}`;
    $("cameraStatus").innerHTML = `❌ ${why}`;
    $("cameraStatus").classList.add("error");
    return;
  }

  $("camera").srcObject = stream;
  $("startCamera").disabled = true;
  $("stopCamera").disabled = false;
  $("teachOnce").disabled = false;
  $("teachBurst").disabled = false;
  $("cameraStatus").classList.remove("error");
  $("cameraStatus").textContent = "Camera on. The feed stays on this device.";
  liveTimer = setInterval(look, LOOK_EVERY_MS);
}

function stopCamera() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  $("camera").srcObject = null;
  $("startCamera").disabled = false;
  $("stopCamera").disabled = true;
  $("teachOnce").disabled = true;
  $("teachBurst").disabled = true;
  $("liveRead").textContent = "Camera off";
  $("cameraStatus").textContent = "Camera off.";
}

/** One frame, as raw pixels. */
function grabFrame() {
  const video = $("camera");
  if (!video.videoWidth) return null;
  const canvas = $("capture");
  // Small on purpose: she measures a 96px working image anyway, so decoding a
  // full-resolution frame twice a second would be wasted work on a Pi.
  const scale = Math.min(1, 320 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------- looking
function look() {
  if (teaching) return;                 // do not fight the burst for the camera
  const frame = grabFrame();
  if (!frame) return;

  const described = Scene.describe(frame, lastScene);
  lastScene = described;
  const report = Scene.report(described);
  const seen = eye.recognise(frame);

  $("liveRead").textContent = seen.label
    ? `${seen.label} · ${Math.round(seen.confidence * 100)}%`
    : report.usable ? "nothing I know" : "cannot see";

  $("guess").textContent = seen.label ? seen.label : seen.ambiguous ? seen.ambiguous.join(" or ") : "—";
  $("guess").className = `eye-guess ${seen.label ? "known" : seen.ambiguous ? "unsure" : "unknown"}`;
  $("guessWhy").textContent = seen.reason || "";

  const notes = $("sceneNotes");
  notes.innerHTML = "";
  for (const note of report.notes) {
    const li = document.createElement("li");
    li.textContent = note;
    notes.appendChild(li);
  }
  // Ranked alternatives, when she knows anything at all, so a wrong answer is
  // legible rather than mysterious.
  if (seen.ranked?.length > 1) {
    const li = document.createElement("li");
    li.textContent = `Closest matches: ${seen.ranked.slice(0, 3).map((r) => `${r.label} (${r.distance.toFixed(2)} away)`).join(", ")}`;
    notes.appendChild(li);
  }
}

// ---------------------------------------------------------------- teaching
function teachOnce() {
  const label = $("objectName").value.trim();
  if (!label) {
    $("teachStatus").textContent = "Give it a name first — that is the part she is learning.";
    return null;
  }
  const frame = grabFrame();
  if (!frame) return null;

  const result = eye.learn(label, frame);
  if (!result.learned) {
    $("teachStatus").textContent = `❌ ${result.reason}`;
    return null;
  }
  $("teachStatus").textContent = `“${label}” — ${result.examples} shot${result.examples === 1 ? "" : "s"}. ${result.advice}`;
  $("teachProgress").style.width = `${Math.min(100, (result.examples / 8) * 100)}%`;
  renderKnown();
  return result;
}

/** Eight shots, a second apart, so you can move the object between them. */
async function teachBurst() {
  const label = $("objectName").value.trim();
  if (!label) {
    $("teachStatus").textContent = "Give it a name first.";
    return;
  }
  teaching = true;
  $("teachBurst").disabled = true;
  $("teachOnce").disabled = true;
  for (let i = 0; i < 8; i++) {
    $("teachStatus").textContent = `Shot ${i + 1} of 8 — keep moving it…`;
    await new Promise((r) => setTimeout(r, 1000));
    const frame = grabFrame();
    if (frame) eye.learn(label, frame);
    $("teachProgress").style.width = `${((i + 1) / 8) * 100}%`;
  }
  teaching = false;
  $("teachBurst").disabled = false;
  $("teachOnce").disabled = false;
  const known = eye.known().find((k) => k.label === label);
  $("teachStatus").textContent = `Done — she has ${known?.examples ?? 8} views of “${label}”. Show it to her again to check.`;
  renderKnown();
}

// ---------------------------------------------------------------- what she knows
function renderKnown() {
  const list = eye.known();
  const box = $("knownList");
  if (!list.length) {
    box.innerHTML = '<p class="hint">Nothing yet.</p>';
    return;
  }
  box.innerHTML = "";
  for (const item of list.sort((a, b) => b.examples - a.examples)) {
    const row = document.createElement("div");
    row.className = "known-row";
    row.innerHTML =
      `<span class="known-label">${item.label}</span>` +
      `<span class="known-meta">${item.examples} views · ${item.consistency}</span>`;
    const forget = document.createElement("button");
    forget.className = "ghost-btn";
    forget.textContent = "Forget";
    forget.addEventListener("click", () => { eye.forget(item.label); renderKnown(); });
    row.appendChild(forget);
    box.appendChild(row);
  }
}

// ---------------------------------------------------------------- files
$("exportEye").addEventListener("click", () => {
  const payload = { format: "eve-eye-1", exported: new Date().toISOString(), objects: eye.known(), raw: localStorage.getItem("eve_eye") };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "eve-eye.json";
  a.click();
  URL.revokeObjectURL(a.href);
  $("fileStatus").textContent = `Exported ${eye.known().length} object(s) — copy it to another machine, or onto the Pi.`;
});

$("importEyeBtn").addEventListener("click", () => $("importEye").click());
$("importEye").addEventListener("change", () => {
  const file = $("importEye").files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed.format !== "eve-eye-1" || !parsed.raw) throw new Error("that is not one of her eye files");
      localStorage.setItem("eve_eye", parsed.raw);
      location.reload();
    } catch (err) {
      $("fileStatus").textContent = `❌ Could not import: ${err.message}`;
    }
  };
  reader.readAsText(file);
});

$("forgetAll").addEventListener("click", () => {
  if (!confirm("Forget every object she has been taught? This cannot be undone.")) return;
  localStorage.removeItem("eve_eye");
  location.reload();
});

$("startCamera").addEventListener("click", startCamera);
$("stopCamera").addEventListener("click", stopCamera);
$("teachOnce").addEventListener("click", teachOnce);
$("teachBurst").addEventListener("click", teachBurst);
$("objectName").addEventListener("keydown", (e) => { if (e.key === "Enter") teachOnce(); });
window.addEventListener("beforeunload", stopCamera);

renderKnown();

// ---------------------------------------------------------------------------
// Learning from a folder of photos
//
// The browser decodes JPEG, PNG and everything else natively, which is why this
// lives here rather than in a command-line tool: doing it in Node would mean
// writing a JPEG decoder from scratch to keep the zero-dependency promise.
// ---------------------------------------------------------------------------

/** A File → the pixels her eye works on. */
async function imageFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error(`could not read ${file.name}`));
      img.src = url;
    });
    /* Same working size her camera uses. Comparing a 4000px photo against a
     * 160px camera frame would compare two different things. */
    const w = 160;
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Group files by the folder they sit in — that folder names the object. */
function groupByFolder(files) {
  const groups = new Map();
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const parts = (file.webkitRelativePath || file.name).split("/");
    // The immediate parent folder, ignoring the wrapper folder you selected.
    const label = parts.length > 1 ? parts[parts.length - 2] : "unnamed";
    const name = label.replace(/[-_]+/g, " ").trim().toLowerCase();
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(file);
  }
  return groups;
}

async function importPhotos(files, forcedLabel = null) {
  const groups = forcedLabel
    ? new Map([[forcedLabel, [...files].filter((f) => f.type.startsWith("image/"))]])
    : groupByFolder(files);

  if (!groups.size) {
    $("importStatus").textContent = "No images in there.";
    return;
  }

  $("importReport").innerHTML = "";
  let done = 0;
  let total = 0;
  for (const list of groups.values()) total += list.length;

  for (const [label, list] of groups) {
    /* A quarter held back, never learned from — otherwise the score below is
     * her repeating photos she was trained on, which measures nothing. */
    const holdout = Math.max(1, Math.round(list.length * 0.25));
    const learnFrom = list.slice(0, list.length - holdout);
    const testWith = list.slice(list.length - holdout);

    for (const file of learnFrom) {
      try { eye.learn(label, await imageFromFile(file)); } catch { /* skip an unreadable file */ }
      done++;
      $("importFill").style.width = `${(done / total) * 100}%`;
      $("importStatus").textContent = `Learning “${label}” — ${done} of ${total} photos…`;
      await new Promise((r) => setTimeout(r, 0));
    }

    let right = 0;
    for (const file of testWith) {
      try {
        const result = eye.recognise(await imageFromFile(file));
        if (result.label === label) right++;
      } catch { /* skip */ }
      done++;
      $("importFill").style.width = `${(done / total) * 100}%`;
    }

    const score = testWith.length ? right / testWith.length : null;
    const row = document.createElement("div");
    row.className = `capability ${score !== null && score >= 0.6 ? "yes" : "no"}`;
    row.innerHTML = `<span class="capability-name"></span><span class="capability-detail"></span>`;
    row.querySelector(".capability-name").textContent =
      `${score !== null && score >= 0.6 ? "✅" : "⚠️"} ${label}`;
    row.querySelector(".capability-detail").textContent =
      `learned from ${learnFrom.length}, ${score === null ? "not scored" : `${(score * 100).toFixed(0)}% on ${testWith.length} held back`}` +
      `${learnFrom.length < 15 ? " · under 20 photos is thin" : ""}`;
    $("importReport").appendChild(row);
  }

  $("importFill").style.width = "0%";
  $("importStatus").textContent =
    `Done — ${groups.size} object${groups.size === 1 ? "" : "s"} from ${total} photos. ` +
    `Point the camera at one to see whether it holds up in your room, which is the number that matters.`;
  renderKnown();
}

$("pickFolderBtn").addEventListener("click", () => $("folderInput").click());
$("folderInput").addEventListener("change", (e) => importPhotos(e.target.files));

$("pickFilesBtn").addEventListener("click", () => $("filesInput").click());
$("filesInput").addEventListener("change", (e) => {
  const label = prompt("What are these photos of?");
  if (label) importPhotos(e.target.files, label.trim().toLowerCase());
});
