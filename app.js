/* GradeMyCard — AI trading card grader.
 * Runs fully client-side: the photo + API key go straight from the browser
 * to the chosen OpenAI-compatible provider serving Llama vision models. */

const PROVIDERS = {
  groq: {
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    keyHelp: 'Get a free key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>.',
  },
  openrouter: {
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-4-scout",
    keyHelp: 'Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>.',
  },
  together: {
    name: "Together AI",
    endpoint: "https://api.together.xyz/v1/chat/completions",
    defaultModel: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    keyHelp: 'Get a key at <a href="https://api.together.ai/settings/api-keys" target="_blank" rel="noopener">api.together.ai</a>.',
  },
};

const GRADING_PROMPT = `You are a professional trading card grader (like a PSA/BGS grader) examining a photo of a collectible card (Pokémon, football, baseball, basketball, soccer, etc.).

Carefully inspect the card in the image and estimate its condition. Consider:
- CENTERING: how evenly the borders are sized left/right and top/bottom
- CORNERS: sharpness vs. whitening, fraying or rounding on all four corners
- EDGES: chipping, whitening or roughness along the edges
- SURFACE: scratches, print lines, creases, dents, stains, holo wear

Respond with ONLY a JSON object (no markdown fences, no extra text) in exactly this shape:
{
  "card_name": "best guess of the card's name, or 'Unknown card'",
  "card_set": "set/series and year if identifiable, else ''",
  "card_type": "pokemon | football | baseball | basketball | soccer | other",
  "centering": <number 1-10>,
  "corners": <number 1-10>,
  "edges": <number 1-10>,
  "surface": <number 1-10>,
  "overall_grade": <number 1-10, may use .5 steps, weighted like PSA (lowest subgrade matters most)>,
  "grade_label": "Gem Mint | Mint | Near Mint-Mint | Near Mint | Excellent | Very Good | Good | Fair | Poor",
  "confidence": "low | medium | high (how clearly the photo shows condition details)",
  "observations": ["3-6 short, specific notes about what you saw, e.g. 'slight whitening on bottom-left corner'"]
}

If the image does not appear to contain a trading card, set card_name to "Not a trading card", every grade to 1, confidence to "low", and explain in observations.`;

// ---------- element refs ----------
const $ = (id) => document.getElementById(id);
const els = {
  settingsBtn: $("settingsBtn"),
  settingsPanel: $("settingsPanel"),
  provider: $("provider"),
  model: $("model"),
  apiKey: $("apiKey"),
  keyHelp: $("keyHelp"),
  saveSettings: $("saveSettings"),
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

// ---------- settings ----------
function loadSettings() {
  const provider = localStorage.getItem("gmc_provider") || "groq";
  els.provider.value = provider;
  els.model.value = localStorage.getItem("gmc_model") || PROVIDERS[provider].defaultModel;
  els.apiKey.value = localStorage.getItem("gmc_api_key") || "";
  els.keyHelp.innerHTML = PROVIDERS[provider].keyHelp;
}

function saveSettings() {
  localStorage.setItem("gmc_provider", els.provider.value);
  localStorage.setItem("gmc_model", els.model.value.trim());
  localStorage.setItem("gmc_api_key", els.apiKey.value.trim());
  setStatus("Settings saved ✔", false);
  els.settingsPanel.classList.add("hidden");
  updateGradeButton();
}

els.provider.addEventListener("change", () => {
  els.model.value = PROVIDERS[els.provider.value].defaultModel;
  els.keyHelp.innerHTML = PROVIDERS[els.provider.value].keyHelp;
});
els.settingsBtn.addEventListener("click", () => els.settingsPanel.classList.toggle("hidden"));
els.saveSettings.addEventListener("click", saveSettings);

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

async function gradeCard() {
  const providerId = localStorage.getItem("gmc_provider") || els.provider.value;
  const provider = PROVIDERS[providerId] || PROVIDERS.groq;
  const model = (localStorage.getItem("gmc_model") || provider.defaultModel).trim();
  const apiKey = (localStorage.getItem("gmc_api_key") || els.apiKey.value).trim();

  if (!apiKey) {
    els.settingsPanel.classList.remove("hidden");
    els.settingsPanel.scrollIntoView({ behavior: "smooth" });
    setStatus(`Add your ${provider.name} API key first (⚙️ API Settings).`, true);
    return;
  }

  els.gradeBtn.disabled = true;
  els.results.classList.add("hidden");
  setStatus("Inspecting centering, corners, edges & surface…", false, true);

  try {
    const res = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: GRADING_PROMPT },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      let detail = "";
      try { detail = JSON.parse(body)?.error?.message || ""; } catch { /* raw body */ }
      if (res.status === 401) throw new Error("Invalid API key — check ⚙️ API Settings.");
      if (res.status === 429) throw new Error("Rate limited by the provider — wait a moment and retry.");
      throw new Error(detail || `Provider error (HTTP ${res.status}).`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    renderResults(extractJson(text));
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
loadSettings();
updateGradeButton();
if (!localStorage.getItem("gmc_api_key")) {
  els.settingsPanel.classList.remove("hidden");
}
