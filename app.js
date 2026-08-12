/* GradeMyCard — AI trading card grader.
 *
 * There is no API key here, no provider and no settings, because there is
 * nothing to configure. Eve does the grading, in this browser, on this device.
 * Nothing about a card ever leaves the machine it was photographed on.
 */

// ---------- element refs ----------
const $ = (id) => document.getElementById(id);
const els = {
  dropZone: $("dropZone"),
  fileInput: $("fileInput"),
  dropPlaceholder: $("dropPlaceholder"),
  preview: $("preview"),
  uploadActions: $("uploadActions"),
  changePhoto: $("changePhoto"),
  gradeBtn: $("gradeBtn"),
  statusMsg: $("statusMsg"),
  results: $("results"),
  cardName: $("cardName"),
  cardMeta: $("cardMeta"),
  gradeNumber: $("gradeNumber"),
  gradeLabel: $("gradeLabel"),
  observationList: $("observationList"),
  confidenceValue: $("confidenceValue"),
};

let imageDataUrl = null;

// ---------- image handling ----------
function setImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Downscale to keep the request small & fast.
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      imageDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      els.preview.src = imageDataUrl;
      els.preview.classList.remove("hidden");
      els.dropPlaceholder.classList.add("hidden");
      els.uploadActions.classList.remove("hidden");
      els.results.classList.add("hidden");
      setStatus("");
      updateGradeButton();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

els.dropZone.addEventListener("click", () => els.fileInput.click());
els.dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") els.fileInput.click();
});
els.fileInput.addEventListener("change", () => setImage(els.fileInput.files[0]));
els.changePhoto.addEventListener("click", () => els.fileInput.click());

["dragover", "dragleave", "drop"].forEach((type) => {
  els.dropZone.addEventListener(type, (e) => {
    e.preventDefault();
    els.dropZone.classList.toggle("dragover", type === "dragover");
    if (type === "drop") setImage(e.dataTransfer.files[0]);
  });
});

document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) setImage(item.getAsFile());
});

// ---------- grading ----------
function updateGradeButton() {
  els.gradeBtn.disabled = !imageDataUrl;
}

function setStatus(msg, isError = false, busy = false) {
  els.statusMsg.classList.toggle("error", isError);
  els.statusMsg.innerHTML = busy ? `<span class="spinner"></span>${msg}` : msg;
}

function extractJson(text) {
  // Models sometimes wrap JSON in fences or prose — fish it out.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The model did not return a readable grade. Try again.");
  return JSON.parse(match[0]);
}

/** Decode the uploaded photo into raw pixels for Eve to measure. */
function imageDataFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Cap the working size so a Raspberry Pi stays quick; card damage is
      // still clearly visible at this resolution.
      const MAX = 700;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = url;
  });
}

/** The Eve doing the grading: yours if you have trained one, else the shipped one. */
let gradingNet = null;

async function loadEve() {
  if (gradingNet) return gradingNet;
  const yours = Eve.loadModel();
  if (yours) { gradingNet = yours.net; return gradingNet; }

  const res = await fetch("eve-model.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Eve is missing from this site — she cannot grade without her weights.");
  const file = await res.json();
  if (file.featureCount !== Vision.FEATURE_COUNT) {
    throw new Error("The shipped Eve does not match this version of the site.");
  }
  gradingNet = NN.Net.fromJSON(file.net);
  gradingNet.__stats = file.stats || null;
  return gradingNet;
}

async function gradeCard() {
  els.gradeBtn.disabled = true;
  els.results.classList.add("hidden");
  setStatus("Inspecting centering, corners, edges & surface…", false, true);
  try {
    const net = await loadEve();
    const image = await imageDataFromUrl(imageDataUrl);
    const result = Eve.grade(net, image);
    const stats = net.__stats || Eve.loadStats();

    renderResults({
      card_name: "Graded by Eve",
      card_set: "on this device, with no key and no network",
      card_type: "other",
      centering: result.centering,
      corners: result.corners,
      edges: result.edges,
      surface: result.surface,
      overall_grade: result.overall,
      grade_label: result.label,
      confidence: stats?.validationMAE
        ? `within about ${stats.validationMAE.toFixed(1)} of a grade point on her practice cards`
        : "unmeasured",
      observations: result.observations,
    });
    setStatus("");
  } catch (err) {
    setStatus(`❌ ${err.message}`, true);
  } finally {
    updateGradeButton();
  }
}

els.gradeBtn.addEventListener("click", gradeCard);

// ---------- rendering ----------
const clampGrade = (n) => Math.min(10, Math.max(1, Number(n) || 1));

function barColor(value) {
  if (value >= 8) return "var(--good)";
  if (value >= 5) return "var(--mid)";
  return "var(--bad)";
}

function renderResults(g) {
  const overall = clampGrade(g.overall_grade);

  els.cardName.textContent = g.card_name || "Unknown card";
  const typeEmoji = { pokemon: "⚡", football: "🏈", baseball: "⚾", basketball: "🏀", soccer: "⚽" }[g.card_type] || "🃏";
  els.cardMeta.textContent = `${typeEmoji} ${[g.card_set, g.card_type].filter(Boolean).join(" · ")}`;
  els.gradeNumber.textContent = Number.isInteger(overall) ? overall : overall.toFixed(1);
  els.gradeLabel.textContent = g.grade_label || "Estimated";

  for (const sub of document.querySelectorAll(".subgrade")) {
    const value = clampGrade(g[sub.dataset.key]);
    sub.querySelector(".subgrade-value").textContent = `${value}/10`;
    const fill = sub.querySelector(".bar-fill");
    fill.style.background = barColor(value);
    fill.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${value * 10}%`; }));
  }

  els.observationList.innerHTML = "";
  for (const note of (Array.isArray(g.observations) ? g.observations : []).slice(0, 8)) {
    const li = document.createElement("li");
    li.textContent = String(note);
    els.observationList.appendChild(li);
  }

  els.confidenceValue.textContent = g.confidence || "unknown";
  els.results.classList.remove("hidden");
  els.results.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- init ----------
updateGradeButton();
// Fetch her weights now rather than on the first click, so grading feels instant.
loadEve().catch(() => { /* reported when the button is pressed */ });
