/* Kodexa — a game-like academy for learning to code.
 * 21 courses (see courses.js), lessons with hearts/XP/streaks, and an
 * endless swipe-style practice feed. Fully client-side: the profile and
 * all progress live in this browser's localStorage. */

"use strict";

/* ===================== State ===================== */
const STORAGE_KEY = "kodexa-v2";
const PROFILE_KEY = "kodexa-profile";
const MAX_HEARTS = 5;
const XP_PER_CORRECT = 2;
const XP_LESSON_BONUS = 10;
const XP_PERFECT_BONUS = 5;

let state = loadState();
let profile = loadProfile();
let activeCourse = null;

function loadState() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* fresh start */ }
  const s = { xp: 0, gems: 0, streak: 0, lastDay: null, completed: {}, chests: {}, mistakes: {}, ...(raw || {}) };
  // migrate v1 progress (JS-only course, keys like "0-1")
  try {
    const v1 = JSON.parse(localStorage.getItem("kodexa-v1"));
    if (v1 && !raw) {
      s.xp = v1.xp || 0; s.gems = v1.gems || 0; s.streak = v1.streak || 0; s.lastDay = v1.lastDay || null;
      for (const k of Object.keys(v1.completed || {})) s.completed["js:" + k] = true;
      for (const k of Object.keys(v1.chests || {})) s.chests["js:" + k] = true;
      localStorage.removeItem("kodexa-v1");
    }
  } catch (e) { /* ignore */ }
  return s;
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleCloudSave();
}

/* ===================== Real sign-in & cloud sync (Firebase) =====================
 * Active only when firebase-config.js provides FIREBASE_CONFIG; otherwise the
 * app falls back to simulated, on-device sign-in. */
const firebaseEnabled =
  typeof firebase !== "undefined" && typeof FIREBASE_CONFIG !== "undefined" && !!FIREBASE_CONFIG;
let fbAuth = null;
let fbDb = null;
let cloudUid = null;
let cloudSaveTimer = null;

if (firebaseEnabled) {
  firebase.initializeApp(FIREBASE_CONFIG);
  fbAuth = firebase.auth();
  fbDb = firebase.firestore();
  fbAuth.onAuthStateChanged(handleCloudUser);
}

/* Combine device progress with cloud progress: keep the best of both. */
function mergeStates(a, b) {
  const merged = { ...a };
  merged.xp = Math.max(a.xp || 0, b.xp || 0);
  merged.gems = Math.max(a.gems || 0, b.gems || 0);
  merged.streak = Math.max(a.streak || 0, b.streak || 0);
  merged.lastDay = [a.lastDay, b.lastDay].filter(Boolean).sort().pop() || null;
  merged.completed = { ...(b.completed || {}), ...(a.completed || {}) };
  merged.chests = { ...(b.chests || {}), ...(a.chests || {}) };
  merged.mistakes = { ...(b.mistakes || {}), ...(a.mistakes || {}) };
  return merged;
}

async function handleCloudUser(user) {
  if (!user) return;
  cloudUid = user.uid;
  try {
    const snap = await fbDb.collection("users").doc(user.uid).get();
    if (snap.exists && snap.data().state) state = mergeStates(state, snap.data().state);
  } catch (e) { /* offline or rules issue — keep local state */ }
  const providerId = (user.providerData[0] || {}).providerId || "";
  saveProfile({
    name: user.displayName || (user.email || "Coder").split("@")[0],
    email: user.email || "",
    method: providerId === "google.com" ? "Google" : providerId === "apple.com" ? "Apple" : "Email",
    joined: (profile && profile.joined) || todayStr(),
  });
  saveState(); // persists the merged progress locally and to the cloud
  enterApp();
}

function scheduleCloudSave() {
  if (!fbDb || !cloudUid) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    fbDb.collection("users").doc(cloudUid)
      .set({ state, name: profile ? profile.name : "", updated: new Date().toISOString() })
      .catch(() => { /* retried on next save */ });
  }, 1500);
}

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch (e) { return null; }
}
function saveProfile(p) { profile = p; localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }

function todayStr() { return new Date().toISOString().slice(0, 10); }
function bumpStreak() {
  const today = todayStr();
  if (state.lastDay === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streak = state.lastDay === yesterday ? state.streak + 1 : 1;
  state.lastDay = today;
  if (state.streak >= 2) showToast(`🔥 <b>${state.streak}-day streak!</b> You're on a roll!`);
  bumpStat("statStreak");
}

/* ===================== Levels =====================
 * Levels are DERIVED from XP (xp needed for level n = 20·(n−1)²),
 * so nothing extra is stored and progress can never desync. */
const xpForLevel = (lvl) => 20 * (lvl - 1) * (lvl - 1);
function levelProgress(xp) {
  const lvl = Math.floor(Math.sqrt(xp / 20)) + 1;
  const cur = xpForLevel(lvl);
  const next = xpForLevel(lvl + 1);
  return { lvl, pct: Math.round(((xp - cur) / (next - cur)) * 100), toNext: next - xp };
}

/* ===================== Daily quests ===================== */
function dailyData() {
  const day = todayStr();
  if (!state.daily || state.daily.day !== day) {
    state.daily = { day, xp: 0, lessons: 0, correct: 0, claimed: false };
  }
  return state.daily;
}

const DAILY_GOALS = [
  { icon: "⚡", label: "Earn 30 XP", key: "xp", max: 30 },
  { icon: "📘", label: "Finish 1 lesson", key: "lessons", max: 1 },
  { icon: "✅", label: "15 correct answers", key: "correct", max: 15 },
];

function checkDailyQuests() {
  const d = dailyData();
  if (d.claimed) return;
  if (DAILY_GOALS.every((g) => (d[g.key] || 0) >= g.max)) {
    d.claimed = true;
    state.gems += 15;
    saveState();
    sfx.sparkle();
    showToast("🎁 <b>Daily quests complete!</b> +15 💎");
  }
}

/* Single entry point for earning XP: persists, updates UI, floats the
 * gain near `anchor` if given, and celebrates level-ups. */
function addXp(amount, anchor) {
  const before = levelProgress(state.xp).lvl;
  state.xp += amount;
  dailyData().xp += amount;
  saveState();
  renderHeader();
  bumpStat("statXp");
  if (anchor) floatAt(anchor, `+${amount} XP`);
  const after = levelProgress(state.xp).lvl;
  if (after > before) {
    showToast(`🏅 <b>Level ${after}!</b> ${["Keep it up!", "Unstoppable!", "Big brain energy!"][after % 3]}`);
    sfx.sparkle();
    confetti(24);
  }
  checkDailyQuests();
}

/* ===================== Toast ===================== */
let toastTimer = null;
function showToast(html) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.innerHTML = html;
  t.classList.remove("show");
  void t.offsetWidth;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

const lessonKey = (cid, u, l) => `${cid}:${u}-${l}`;
const courseById = (id) => COURSES.find((c) => c.id === id);

function courseLessonCount(course) {
  return course.units.reduce((n, u) => n + u.lessons.length, 0);
}
function courseDoneCount(course) {
  let n = 0;
  course.units.forEach((u, ui) => u.lessons.forEach((_, li) => {
    if (state.completed[lessonKey(course.id, ui, li)]) n++;
  }));
  return n;
}
function firstIncompleteIndex(course) {
  let i = 0;
  for (let u = 0; u < course.units.length; u++)
    for (let l = 0; l < course.units[u].lessons.length; l++) {
      if (!state.completed[lessonKey(course.id, u, l)]) return i;
      i++;
    }
  return i;
}

/* ===================== DOM helpers ===================== */
const $ = (id) => document.getElementById(id);
const SCREENS = ["authScreen", "homeScreen", "courseScreen", "lessonScreen", "resultScreen", "practiceScreen", "targetScreen", "coachScreen", "playScreen"];
const FULLSCREEN_TABS = ["lessonScreen", "practiceScreen", "targetScreen", "coachScreen", "playScreen"];

function show(id) {
  SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  const el = $(id);
  el.classList.remove("screen-anim");
  void el.offsetWidth; // restart the entrance animation
  el.classList.add("screen-anim");
  const inApp = id !== "authScreen";
  $("topbar").classList.toggle("hidden", !inApp || FULLSCREEN_TABS.includes(id));
  $("bottomnav").classList.toggle("hidden", !inApp || id === "lessonScreen" || id === "resultScreen");
  $("navLearn").classList.toggle("active", id === "homeScreen" || id === "courseScreen");
  $("navPractice").classList.toggle("active", id === "practiceScreen");
  $("navTarget").classList.toggle("active", id === "targetScreen");
  $("navPlay").classList.toggle("active", id === "playScreen");
  $("navCoach").classList.toggle("active", id === "coachScreen");
  if (id !== "practiceScreen" && id !== "targetScreen") window.scrollTo(0, 0);
}

/* ===================== Mistake tracking (feeds Targeted Practice) ===================== */
const TRACKABLE = ["mc", "fill", "type", "code"];
const mistakeKey = (courseId, ex) => courseId + "|" + ex.q + "|" + (ex.code || "");

function recordMistake(ex, courseId) {
  const k = ex.gen ? ex.srcKey : (TRACKABLE.includes(ex.t) ? mistakeKey(courseId, ex) : null);
  if (!k) return;
  const m = state.mistakes[k] || { c: 0, t: 0 };
  m.c = Math.min(m.c + 1, 9);
  m.t = Date.now();
  state.mistakes[k] = m;
  const keys = Object.keys(state.mistakes);
  if (keys.length > 80) { // keep the most recent 80 weak spots
    keys.sort((a, b) => state.mistakes[a].t - state.mistakes[b].t);
    delete state.mistakes[keys[0]];
  }
  saveState();
}

function clearMistake(ex, courseId) {
  const k = ex.gen ? ex.srcKey : mistakeKey(courseId, ex);
  const m = state.mistakes[k];
  if (!m) return;
  m.c--;
  if (m.c <= 0) {
    delete state.mistakes[k];
    showToast("🎯 <b>Weak spot cleared!</b> Nice comeback!");
  }
  saveState();
}

function weakSpots() {
  const out = [];
  COURSES.forEach((course) => course.units.forEach((u) => u.lessons.forEach((l) => l.exercises.forEach((ex) => {
    const m = state.mistakes[mistakeKey(course.id, ex)];
    if (m && TRACKABLE.includes(ex.t) && !out.some((w) => w.ex === ex)) out.push({ ex, course, count: m.c });
  }))));
  out.sort((a, b) => b.count - a.count);
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHeader() {
  $("statStreak").textContent = state.streak;
  $("statGems").textContent = state.gems;
  $("statXp").textContent = state.xp;
  $("avatarBtn").textContent = profile ? (profile.name[0] || "?").toUpperCase() : "?";
  const lp = levelProgress(state.xp);
  $("statLevel").textContent = lp.lvl;
  $("lvlFill").style.width = lp.pct + "%";
  $("levelChip").title = `Level ${lp.lvl} — ${lp.toNext} XP to level ${lp.lvl + 1}`;
}

/* ===================== Sounds (WebAudio synth) ===================== */
let audioCtx = null;
function note(freq, at, dur, type = "triangle", vol = 0.13) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + at;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch (e) { /* sound is best-effort */ }
}
function playTone(freqs, duration = 0.12) { freqs.forEach((f, i) => note(f, i * duration, duration + 0.05)); }
const sfx = {
  tap: () => note(700, 0, 0.05, "square", 0.035),
  select: () => note(950, 0, 0.06, "square", 0.045),
  correct: () => { note(587.33, 0, 0.12); note(880, 0.09, 0.22); note(1108.73, 0.09, 0.22, "sine", 0.06); },
  wrong: () => { note(196, 0, 0.2, "sawtooth", 0.05); note(147, 0.16, 0.28, "sawtooth", 0.05); },
  sparkle: () => [784, 988, 1175, 1568].forEach((f, i) => note(f, i * 0.07, 0.14, "triangle", 0.1)),
  fanfare: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.13, 0.26)),
  combo: () => [600, 800, 1050].forEach((f, i) => note(f, i * 0.06, 0.1, "triangle", 0.1)),
  whoosh: () => {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(960, t + 0.55);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
      [1318, 1568].forEach((f, i) => note(f, 0.5 + i * 0.09, 0.16, "triangle", 0.08));
    } catch (e) { /* sound is best-effort */ }
  },
};
const dingGood = sfx.correct;
const dingBad = sfx.wrong;

/* ===================== Juice helpers ===================== */
function floatAt(target, text, gem = false) {
  const r = target.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "xp-float" + (gem ? " gem" : "");
  el.textContent = text;
  el.style.left = r.left + r.width / 2 - 24 + (Math.random() * 36 - 18) + "px";
  el.style.top = r.top - 6 + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
function bumpStat(id) {
  const el = $(id).closest(".stat");
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

/* ===================== Mascot ===================== */
function mascotSVG(color) {
  return `
  <svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <line x1="60" y1="22" x2="60" y2="8" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="60" cy="7" r="6" fill="#fbbf24"/>
    <path d="M60 22 C 25 22 16 50 16 76 C 16 104 36 118 60 118 C 84 118 104 104 104 76 C 104 50 95 22 60 22 Z" fill="${color}"/>
    <ellipse cx="60" cy="92" rx="26" ry="17" fill="rgba(255,255,255,0.28)"/>
    <circle cx="44" cy="62" r="13" fill="#fff"/>
    <circle cx="76" cy="62" r="13" fill="#fff"/>
    <circle cx="47" cy="64" r="6" fill="#0c101e"/>
    <circle cx="73" cy="64" r="6" fill="#0c101e"/>
    <circle cx="49" cy="61.5" r="2" fill="#fff"/>
    <circle cx="75" cy="61.5" r="2" fill="#fff"/>
    <path d="M50 86 Q 60 95 70 86" stroke="#0c101e" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <text x="60" y="106" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="13" fill="rgba(0,0,0,0.45)">&lt;/&gt;</text>
    <ellipse cx="42" cy="122" rx="11" ry="6" fill="${color}"/>
    <ellipse cx="78" cy="122" rx="11" ry="6" fill="${color}"/>
  </svg>`;
}

/* ===================== Auth ===================== */
function initAuth() {
  $("authLogo").innerHTML = mascotSVG("#7c5cff");
  if (firebaseEnabled) {
    $("authNote").textContent = "Real sign-in is enabled — your account and progress sync to the cloud.";
    $("authPassword").classList.remove("hidden");
  }

  document.querySelectorAll("#authButtons [data-method]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const method = btn.dataset.method;
      if (firebaseEnabled) {
        const provider = method === "Apple"
          ? new firebase.auth.OAuthProvider("apple.com")
          : new firebase.auth.GoogleAuthProvider();
        fbAuth.signInWithPopup(provider).catch((err) => {
          alert(`${method} sign-in failed: ${err.message}` +
            (method === "Apple" ? "\n\nNote: Apple sign-in also needs an Apple Developer account configured in Firebase." : ""));
        });
      } else {
        const name = prompt(`What should we call you? (${method} sign-in is simulated until Firebase is configured — see firebase-config.js. Everything stays on this device.)`, "Coder");
        if (name === null) return;
        completeAuth({ name: name.trim() || "Coder", email: `${method.toLowerCase()}-user@device.local`, method });
      }
    });
  });

  $("emailBtn").addEventListener("click", () => {
    $("authButtons").classList.add("hidden");
    $("emailForm").classList.remove("hidden");
    $("authName").focus();
  });
  $("emailBack").addEventListener("click", () => {
    $("emailForm").classList.add("hidden");
    $("authButtons").classList.remove("hidden");
  });

  $("emailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("authName").value.trim() || "Coder";
    const email = $("authEmail").value.trim();
    if (!firebaseEnabled) {
      completeAuth({ name, email, method: "Email" });
      return;
    }
    const pass = $("authPassword").value;
    if (pass.length < 6) { alert("Please use a password with at least 6 characters."); return; }
    try {
      const cred = await fbAuth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName: name });
      saveProfile({ ...(profile || {}), name, email, method: "Email", joined: todayStr() });
      renderHeader();
      renderHome();
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        try { await fbAuth.signInWithEmailAndPassword(email, pass); }
        catch (err2) { alert("Sign-in failed: " + err2.message); }
      } else {
        alert("Sign-up failed: " + err.message);
      }
    }
  });

  $("guestBtn").addEventListener("click", () => completeAuth({ name: "Guest", email: "", method: "Guest" }));
}

function completeAuth(p) {
  saveProfile({ ...p, joined: todayStr() });
  playTone([523, 659, 784], 0.13);
  enterApp();
}

function enterApp() {
  renderHeader();
  renderHome();
  show("homeScreen");
}

/* ===================== Home: course catalog ===================== */
function flatToUL(course, flatIdx) {
  let i = 0;
  for (let u = 0; u < course.units.length; u++)
    for (let l = 0; l < course.units[u].lessons.length; l++) {
      if (i === flatIdx) return { u, l, title: course.units[u].lessons[l].title };
      i++;
    }
  return null;
}

function renderHome() {
  $("greeting").innerHTML = profile && profile.name !== "Guest"
    ? `Hey ${escapeHtml(profile.name)} 👋<br>What are we mastering today?`
    : "Pick a language.<br>Master it.";

  // Continue card + daily quests
  const cards = $("homeCards");
  let html = "";
  const last = state.lastCourse && courseById(state.lastCourse);
  const next = last ? flatToUL(last, firstIncompleteIndex(last)) : null;
  if (last && next) {
    html += `
      <button class="continue-card" id="continueBtn" style="--cc:${last.color}">
        <span class="cc-badge">${escapeHtml(last.badge)}</span>
        <span class="cont-text"><b>Continue ${escapeHtml(last.name)}</b><i>${escapeHtml(next.title)}</i></span>
        <span class="cont-go">▶</span>
      </button>`;
  }
  const d = dailyData();
  html += `
    <div class="quest-card">
      <div class="quest-title">🗓️ Daily Quests ${d.claimed ? '<span class="quest-done">done! +15 💎</span>' : '<span class="quest-reward">reward: 15 💎</span>'}</div>
      ${DAILY_GOALS.map((g) => {
        const cur = Math.min(d[g.key] || 0, g.max);
        return `
        <div class="quest-row${cur >= g.max ? " complete" : ""}">
          <span class="q-icon">${g.icon}</span>
          <span class="q-label">${g.label}</span>
          <span class="q-bar"><i style="width:${(cur / g.max) * 100}%"></i></span>
          <span class="q-count">${cur >= g.max ? "✓" : cur + "/" + g.max}</span>
        </div>`;
      }).join("")}
    </div>`;
  cards.innerHTML = html;
  const cont = $("continueBtn");
  if (cont) cont.addEventListener("click", () => startLesson(last.id, next.u, next.l));

  const grid = $("courseGrid");
  grid.innerHTML = "";
  COURSES.forEach((course, i) => {
    const total = courseLessonCount(course);
    const done = courseDoneCount(course);
    const pct = Math.round((done / total) * 100);
    const card = document.createElement("button");
    card.className = "course-card";
    card.style.setProperty("--cc", course.color);
    card.style.animationDelay = Math.min(i * 30, 450) + "ms";
    card.innerHTML = `
      <div class="cc-top">
        <div class="cc-badge">${escapeHtml(course.badge)}</div>
        <div>
          <div class="cc-name">${escapeHtml(course.name)}</div>
          <div class="cc-tag">${escapeHtml(course.tagline)}</div>
        </div>
      </div>
      <div class="cc-bar"><i style="width:${pct}%"></i></div>
      <div class="cc-meta">
        <span>${course.units.length} units · ${total} lessons</span>
        <span class="cc-diff">${pct > 0 ? pct + "%" : escapeHtml(course.difficulty)}</span>
      </div>`;
    card.addEventListener("click", () => openCourse(course.id));
    grid.appendChild(card);
  });
}

/* ===================== Course page ===================== */
function openCourse(id) {
  activeCourse = courseById(id);
  if (state.lastCourse !== id) { state.lastCourse = id; saveState(); }
  renderCourse();
  show("courseScreen");
}

function renderCourse() {
  const c = activeCourse;
  const total = courseLessonCount(c);
  const done = courseDoneCount(c);
  $("courseHeader").innerHTML = `
    <div class="course-head" style="--cc:${c.color}">
      <div class="cc-badge">${escapeHtml(c.badge)}</div>
      <div>
        <h2>${escapeHtml(c.name)}</h2>
        <div class="cc-tag">${escapeHtml(c.tagline)} · ${escapeHtml(c.difficulty)}</div>
      </div>
      <div class="head-progress"><b>${Math.round((done / total) * 100)}%</b>${done}/${total} lessons</div>
    </div>`;

  const list = $("unitList");
  list.innerHTML = "";
  const currentIdx = firstIncompleteIndex(c);
  let flat = 0;

  c.units.forEach((unit, ui) => {
    const unitDone = unit.lessons.every((_, li) => state.completed[lessonKey(c.id, ui, li)]);
    const chestKey = `${c.id}:${ui}`;
    const claimed = !!state.chests[chestKey];

    const card = document.createElement("div");
    card.className = "unit-card";
    card.style.setProperty("--cc", c.color);
    card.style.animationDelay = Math.min(ui * 40, 400) + "ms";

    const head = document.createElement("div");
    head.className = "unit-head";
    head.innerHTML = `<div><h3>${escapeHtml(unit.title)}</h3><p>${escapeHtml(unit.desc)}</p></div>`;
    const guide = document.createElement("button");
    guide.className = "guide-btn";
    guide.textContent = "📖";
    guide.title = "Open the unit cheat sheet";
    guide.addEventListener("click", () => openGuidebook(unit, c));
    head.appendChild(guide);
    const chest = document.createElement("button");
    chest.className = "chest-btn" + (unitDone && !claimed ? " claimable" : "");
    chest.textContent = unitDone && claimed ? "✅" : "🎁";
    chest.title = claimed ? "Chest claimed" : unitDone ? "Claim 20 gems!" : "Finish the unit to unlock the chest";
    chest.disabled = !unitDone || claimed;
    if (unitDone && !claimed) {
      chest.addEventListener("click", () => {
        state.gems += 20;
        state.chests[chestKey] = true;
        saveState();
        sfx.sparkle();
        floatAt(chest, "+20 💎", true);
        renderHeader();
        bumpStat("statGems");
        renderCourse();
      });
    }
    head.appendChild(chest);
    card.appendChild(head);

    unit.lessons.forEach((lesson, li) => {
      const done = !!state.completed[lessonKey(c.id, ui, li)];
      const isCurrent = flat === currentIdx;
      const locked = !done && !isCurrent;
      const row = document.createElement("button");
      row.className = "lesson-row" + (done ? " done" : isCurrent ? " current" : "");
      row.disabled = locked;
      row.innerHTML = `
        <span class="lr-icon">${done ? "✓" : locked ? "🔒" : "▶"}</span>
        <span class="lr-title">${escapeHtml(lesson.title)}</span>
        <span class="lr-count">${lesson.exercises.length} exercises</span>
        ${isCurrent ? '<span class="lr-start">START</span>' : ""}`;
      row.addEventListener("click", () => startLesson(c.id, ui, li));
      card.appendChild(row);
      flat++;
    });

    list.appendChild(card);
  });
}

$("courseBack").addEventListener("click", () => { renderHome(); renderHeader(); show("homeScreen"); });

/* ===================== Lesson engine ===================== */
let lesson = null;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Duolingo-style lesson-start transition: dark screen full of twinkling stars */
let transitioning = false;
function lessonTransition(course, title, cb) {
  if (transitioning) return;
  transitioning = true;
  const ov = document.createElement("div");
  ov.className = "transition-ov";
  for (let i = 0; i < 18; i++) {
    const sp = document.createElement("span");
    sp.className = "sparkle";
    const size = 8 + Math.random() * 18;
    sp.style.width = sp.style.height = size + "px";
    sp.style.left = Math.random() * 100 + "vw";
    sp.style.top = Math.random() * 100 + "vh";
    sp.style.animationDelay = Math.random() * 0.7 + "s";
    sp.style.opacity = 0.4 + Math.random() * 0.6;
    ov.appendChild(sp);
  }
  ov.insertAdjacentHTML("beforeend", `
    <div class="tr-badge" style="background:${course.color}">${escapeHtml(course.badge)}</div>
    <div class="tr-title">${escapeHtml(title)}</div>
    <div class="tr-sub">${escapeHtml(course.name)} · earn up to +${XP_LESSON_BONUS + XP_PERFECT_BONUS} XP bonus</div>`);
  document.body.appendChild(ov);
  sfx.whoosh();
  setTimeout(() => {
    cb();
    ov.classList.add("out");
    setTimeout(() => { ov.remove(); transitioning = false; }, 320);
  }, 1150);
}

function startLesson(cid, u, l) {
  const course = courseById(cid);
  const title = course.units[u].lessons[l].title;
  lessonTransition(course, title, () => beginLesson(cid, u, l));
}

function beginLesson(cid, u, l) {
  const course = courseById(cid);
  activeCourse = course;
  const data = course.units[u].lessons[l];
  lesson = {
    cid, u, l,
    queue: shuffle(data.exercises),
    total: data.exercises.length,
    correct: 0,
    mistakes: 0,
    hearts: MAX_HEARTS,
    checked: false,
    intro: true,
    getAnswer: null,
  };
  show("lessonScreen");
  renderLessonChrome();
  renderLessonIntro();
}

/* Intro card shown before the questions: what this unit/section is about */
const INTRO_KEY = "kodexa-intros";

function renderLessonIntro() {
  const c = activeCourse;
  const unit = c.units[lesson.u];
  const lessonData = unit.lessons[lesson.l];
  const snippets = unitCheats(unit).slice(0, 3);
  const area = $("exerciseArea");
  $("feedback").className = "feedback hidden";
  area.innerHTML = `
    <div class="intro-card">
      <div class="guide-head">
        <span class="cc-badge" style="background:${c.color}">${escapeHtml(c.badge)}</span>
        <div>
          <h2>${escapeHtml(unit.title)}</h2>
          <p>${escapeHtml(lessonData.title)} · ${lesson.total} questions</p>
        </div>
      </div>
      <p class="intro-ai" id="introAi">📚 ${escapeHtml(unit.desc)}.</p>
      ${snippets.length ? '<div class="guide-label">Code you\'ll meet</div>' +
        snippets.map((s) => `<pre class="guide-snippet">${escapeHtml(s)}</pre>`).join("") : ""}
    </div>`;
  const btn = $("checkBtn");
  btn.textContent = "START LESSON";
  btn.className = "big-btn";
  btn.disabled = false;
  unitIntroText(c, unit, lessonData);
}

async function unitIntroText(course, unit, lessonData) {
  const el = $("introAi");
  if (!el) return;
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(INTRO_KEY)) || {}; } catch (e) { /* fresh */ }
  const key = course.id + "|" + unit.title + "|" + lessonData.title;
  if (cache[key]) { el.textContent = "📚 " + cache[key]; return; }
  if (typeof AI_FEEDBACK === "undefined" || !AI_FEEDBACK || !AI_FEEDBACK.key) return;
  try {
    const res = await fetch(AI_FEEDBACK.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + AI_FEEDBACK.key },
      body: JSON.stringify({
        model: AI_FEEDBACK.model,
        temperature: 0.4,
        max_tokens: 120,
        messages: [
          { role: "system", content: "Write 2 short, friendly sentences for a total beginner explaining what this coding lesson teaches and why it's useful. No markdown, no lists, no greetings." },
          { role: "user", content: `${course.name} course — ${unit.title} (${unit.desc}). Lesson: ${lessonData.title}.` },
        ],
      }),
    });
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (msg && msg.trim() && $("introAi")) {
      cache[key] = msg.trim();
      const keys = Object.keys(cache);
      if (keys.length > 200) delete cache[keys[0]];
      localStorage.setItem(INTRO_KEY, JSON.stringify(cache));
      $("introAi").textContent = "📚 " + msg.trim();
    }
  } catch (e) { /* keep the template text */ }
}

function renderLessonChrome() {
  $("lessonHearts").textContent = lesson.hearts;
  $("progressFill").style.width = `${(lesson.correct / lesson.total) * 100}%`;
}

function nextExercise() {
  if (lesson.hearts <= 0) return endLesson(false);
  if (lesson.queue.length === 0) return endLesson(true);
  lesson.checked = false;
  renderLessonChrome();
  $("feedback").className = "feedback hidden";
  const btn = $("checkBtn");
  btn.textContent = "CHECK";
  btn.className = "big-btn";
  btn.disabled = true;
  renderExercise(lesson.queue[0], $("exerciseArea"), (fn) => { lesson.getAnswer = fn; }, () => setCheckEnabled(true), () => setCheckEnabled(false));
}

function setCheckEnabled(on) {
  if (!lesson.checked) $("checkBtn").disabled = !on;
}

/* Shared exercise renderer.
 * setAnswer(fn) registers the grader; onReady/onNotReady toggle the check button. */
function renderExercise(ex, area, setAnswer, onReady, onNotReady) {
  area.innerHTML = "";
  area.classList.remove("ex-slide");
  void area.offsetWidth; // restart the slide-in between exercises
  area.classList.add("ex-slide");
  const q = document.createElement("div");
  q.className = "exercise-q";
  q.textContent = ex.q;
  area.appendChild(q);
  if (ex.t === "mc") renderMC(ex, area, setAnswer, onReady);
  else if (ex.t === "fill") renderFill(ex, area, setAnswer, onReady, onNotReady);
  else if (ex.t === "order") renderOrder(ex, area, setAnswer, onReady, onNotReady);
  else if (ex.t === "type") renderType(ex, area, setAnswer, onReady, onNotReady);
  else if (ex.t === "code") renderCode(ex, area, setAnswer, onReady, onNotReady);
}

function addCode(area, code) {
  if (!code) return null;
  const pre = document.createElement("div");
  pre.className = "code-block";
  pre.textContent = code;
  area.appendChild(pre);
  return pre;
}

function renderMC(ex, area, setAnswer, onReady) {
  addCode(area, ex.code);
  const list = document.createElement("div");
  list.className = "choices";
  let selected = -1;
  const orderIdx = shuffle(ex.choices.map((_, i) => i));
  let graded = false;
  const buttons = orderIdx.map((origIdx) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.innerHTML = `<code>${escapeHtml(ex.choices[origIdx])}</code>`;
    b.addEventListener("click", () => {
      if (graded) return;
      selected = origIdx;
      buttons.forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      sfx.select();
      onReady();
    });
    list.appendChild(b);
    return b;
  });
  area.appendChild(list);

  setAnswer(() => {
    graded = true;
    const ok = selected === ex.a;
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (orderIdx[i] === ex.a) b.classList.add("correct");
      else if (orderIdx[i] === selected && !ok) b.classList.add("wrong");
    });
    return { ok, correctText: ex.choices[ex.a] };
  });
}

function renderFill(ex, area, setAnswer, onReady, onNotReady) {
  const pre = addCode(area, " ");
  const parts = ex.code.split("___");
  const blank = document.createElement("span");
  blank.className = "blank";
  blank.textContent = " ";
  pre.textContent = "";
  pre.append(document.createTextNode(parts[0]), blank, document.createTextNode(parts[1] ?? ""));

  const bank = document.createElement("div");
  bank.className = "chips";
  let selected = -1;
  let graded = false;
  const orderIdx = shuffle(ex.choices.map((_, i) => i));
  const chips = orderIdx.map((origIdx) => {
    const cBtn = document.createElement("button");
    cBtn.className = "chip";
    cBtn.textContent = ex.choices[origIdx];
    cBtn.addEventListener("click", () => {
      if (graded) return;
      sfx.tap();
      selected = selected === origIdx ? -1 : origIdx;
      chips.forEach((x) => x.classList.remove("selected"));
      if (selected !== -1) {
        cBtn.classList.add("selected");
        blank.textContent = ex.choices[origIdx];
        blank.classList.add("filled");
        onReady();
      } else {
        blank.textContent = " ";
        blank.classList.remove("filled");
        onNotReady();
      }
    });
    bank.appendChild(cBtn);
    return cBtn;
  });
  area.appendChild(bank);

  setAnswer(() => {
    graded = true;
    return { ok: selected === ex.a, correctText: ex.choices[ex.a] };
  });
}

function renderOrder(ex, area, setAnswer, onReady, onNotReady) {
  const line = document.createElement("div");
  line.className = "order-line";
  area.appendChild(line);
  const bank = document.createElement("div");
  bank.className = "chips";
  area.appendChild(bank);

  const placed = [];
  let graded = false;
  const orderIdx = shuffle(ex.tokens.map((_, i) => i));
  const bankChips = [];

  function redrawLine() {
    line.innerHTML = "";
    placed.forEach((tokenIdx, pos) => {
      const cBtn = document.createElement("button");
      cBtn.className = "chip";
      cBtn.textContent = ex.tokens[tokenIdx];
      cBtn.addEventListener("click", () => {
        if (graded) return;
        placed.splice(pos, 1);
        bankChips[tokenIdx].classList.remove("used");
        redrawLine();
      });
      line.appendChild(cBtn);
    });
    if (placed.length === ex.tokens.length) onReady(); else onNotReady();
  }

  orderIdx.forEach((tokenIdx) => {
    const cBtn = document.createElement("button");
    cBtn.className = "chip";
    cBtn.textContent = ex.tokens[tokenIdx];
    cBtn.addEventListener("click", () => {
      if (graded || cBtn.classList.contains("used")) return;
      sfx.tap();
      cBtn.classList.add("used");
      placed.push(tokenIdx);
      redrawLine();
    });
    bankChips[tokenIdx] = cBtn;
    bank.appendChild(cBtn);
  });
  redrawLine();

  setAnswer(() => {
    graded = true;
    return {
      ok: placed.length === ex.tokens.length && placed.every((tokenIdx, pos) => ex.tokens[tokenIdx] === ex.tokens[pos]),
      correctText: ex.tokens.join(" "),
    };
  });
}

const normalizeTyped = (s) => s.trim().toLowerCase().replace(/^["']|["']$/g, "").replace(/;$/, "");

/* Forgiving code comparison: fixes phone smart-quotes, ignores spacing,
 * quote style and a trailing semicolon — but stays case-sensitive
 * (except when the exercise sets ci, e.g. SQL keywords). */
function normalizeCode(s, ci) {
  let t = String(s)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, "")
    .replace(/'/g, '"')
    .replace(/;+$/, "");
  if (ci) t = t.toLowerCase();
  return t;
}

function gradeCode(ex, value) {
  return [ex.a, ...(ex.alt || [])].some((v) => normalizeCode(v, ex.ci) === normalizeCode(value, ex.ci));
}

/* AI tutor: explains the specific mistake in a wrong code answer. */
async function requestAiNote(ex, typed, lang, container) {
  if (typeof AI_FEEDBACK === "undefined" || !AI_FEEDBACK || !AI_FEEDBACK.key) return;
  const el = document.createElement("div");
  el.className = "ai-note";
  el.textContent = "🤖 checking your code…";
  container.appendChild(el);
  try {
    const res = await fetch(AI_FEEDBACK.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + AI_FEEDBACK.key },
      body: JSON.stringify({
        model: AI_FEEDBACK.model,
        temperature: 0.2,
        max_tokens: 70,
        messages: [
          { role: "system", content: "You are a friendly coding tutor for beginners. In ONE short sentence (max 25 words), state the specific mistake in the student's code compared to the expected answer. No greetings, no code blocks, no quotes around the sentence." },
          { role: "user", content: `Language: ${lang}\nTask: ${ex.q}\nExpected answer: ${ex.a}\nStudent wrote: ${typed}` },
        ],
      }),
    });
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (msg && msg.trim()) el.textContent = "🤖 " + msg.trim();
    else el.remove();
  } catch (e) { el.remove(); }
}

/* --- write real code with your keyboard --- */
function renderCode(ex, area, setAnswer, onReady, onNotReady) {
  addCode(area, ex.code);
  const editor = document.createElement("div");
  editor.className = "code-editor";
  const gutter = document.createElement("span");
  gutter.className = "gutter";
  gutter.textContent = "1";
  const input = document.createElement("input");
  input.className = "code-input";
  input.placeholder = "type the code here…";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.setAttribute("autocorrect", "off");
  input.spellcheck = false;
  input.addEventListener("input", () => (input.value.trim() ? onReady() : onNotReady()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("checkBtn").disabled && !$("lessonScreen").classList.contains("hidden")) $("checkBtn").click();
  });
  editor.append(gutter, input);
  area.appendChild(editor);
  setTimeout(() => input.focus(), 60);

  setAnswer(() => ({ ok: gradeCode(ex, input.value), correctText: ex.a, typed: input.value }));
}

function renderType(ex, area, setAnswer, onReady, onNotReady) {
  addCode(area, ex.code);
  const input = document.createElement("input");
  input.className = "type-input";
  input.placeholder = "Type your answer…";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.addEventListener("input", () => (input.value.trim() ? onReady() : onNotReady()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("checkBtn").disabled && !$("lessonScreen").classList.contains("hidden")) $("checkBtn").click();
  });
  area.appendChild(input);
  setTimeout(() => input.focus(), 60);

  setAnswer(() => {
    const accepted = [ex.a, ...(ex.alt || [])].map(normalizeTyped);
    return { ok: accepted.includes(normalizeTyped(input.value)), correctText: ex.a };
  });
}

/* --- check / continue flow --- */
$("checkBtn").addEventListener("click", () => {
  if (!lesson) return;
  if (lesson.intro) { lesson.intro = false; sfx.select(); nextExercise(); return; }
  if (lesson.checked) { nextExercise(); return; }

  const { ok, correctText, typed } = lesson.getAnswer();
  lesson.checked = true;
  const ex = lesson.queue.shift();
  const fb = $("feedback");
  const btn = $("checkBtn");
  btn.textContent = "CONTINUE";
  btn.disabled = false;

  if (ok) {
    lesson.correct++;
    dailyData().correct++;
    clearMistake(ex, lesson.cid);
    addXp(XP_PER_CORRECT, btn);
    fb.className = "feedback good";
    $("feedbackTitle").textContent = ["Nice!", "Correct!", "Great job!", "Nailed it!"][Math.floor(Math.random() * 4)];
    $("feedbackDetail").textContent = "+" + XP_PER_CORRECT + " XP";
    btn.className = "big-btn good";
    dingGood();
  } else {
    lesson.mistakes++;
    lesson.hearts--;
    recordMistake(ex, lesson.cid);
    lesson.queue.push(ex); // missed questions come back later in the lesson
    fb.className = "feedback bad";
    $("feedbackTitle").textContent = "Not quite…";
    $("feedbackDetail").innerHTML = `Correct answer: <code>${escapeHtml(correctText)}</code>`;
    $("feedbackDetail").appendChild(makeAskCoachBtn(ex, activeCourse.name, typed));
    if (ex.t === "code" && typeof typed === "string" && typed.trim()) {
      requestAiNote(ex, typed, activeCourse.name, $("feedbackDetail"));
    }
    btn.className = "big-btn bad";
    const hearts = document.querySelector(".lesson-hearts");
    hearts.classList.remove("lost");
    void hearts.offsetWidth;
    hearts.classList.add("lost");
    dingBad();
  }
  renderLessonChrome();
});

$("quitBtn").addEventListener("click", () => {
  if (confirm("Quit this lesson? Your progress in it will be lost.")) {
    lesson = null;
    renderCourse();
    renderHeader();
    show("courseScreen");
  }
});

/* ===================== Lesson end ===================== */
function endLesson(passed) {
  const card = $("resultCard");
  const c = activeCourse;
  if (passed) {
    const perfect = lesson.mistakes === 0;
    state.completed[lessonKey(lesson.cid, lesson.u, lesson.l)] = true;
    dailyData().lessons++;
    addXp(XP_LESSON_BONUS + (perfect ? XP_PERFECT_BONUS : 0));
    bumpStreak();
    saveState();
    checkDailyQuests();
    const earned = XP_LESSON_BONUS + (perfect ? XP_PERFECT_BONUS : 0) + lesson.total * XP_PER_CORRECT;
    const accuracy = Math.round((lesson.total / (lesson.total + lesson.mistakes)) * 100);
    const cheer = perfect
      ? ["Perfect lesson!", "Flawless! 100%!", "Not a single miss!"][Math.floor(Math.random() * 3)]
      : ["Lesson complete!", "Great job!", "You're on a roll!", "Brain: upgraded!"][Math.floor(Math.random() * 4)];

    card.innerHTML = `
      <div class="result-mascot">${mascotSVG(c.color)}</div>
      <h1>${cheer}</h1>
      <p>${escapeHtml(c.units[lesson.u].lessons[lesson.l].title)} · ${escapeHtml(c.name)}</p>
      <div class="result-stats">
        <div class="result-stat"><span class="label">TOTAL XP</span><span class="value">⚡ ${earned}</span></div>
        <div class="result-stat"><span class="label">ACCURACY</span><span class="value">🎯 ${accuracy}%</span></div>
        <div class="result-stat"><span class="label">STREAK</span><span class="value">🔥 ${state.streak}</span></div>
      </div>
      <button class="big-btn" id="resultContinue">CONTINUE</button>`;
    confetti();
    sfx.fanfare();
  } else {
    card.innerHTML = `
      <div class="result-emoji">💔</div>
      <h1>Out of hearts!</h1>
      <p>No worries — mistakes are how you learn. Give it another go.</p>
      <button class="big-btn bad" id="resultRetry">TRY AGAIN</button>
      <button class="big-btn ghost" id="resultContinue">BACK TO COURSE</button>`;
  }

  const { cid, u, l } = lesson;
  lesson = null;
  show("resultScreen");
  renderHeader();
  const retry = $("resultRetry");
  if (retry) retry.addEventListener("click", () => startLesson(cid, u, l));
  $("resultContinue").addEventListener("click", () => {
    renderCourse();
    renderHeader();
    show("courseScreen");
  });
}

function confetti(count = 60) {
  const colors = ["#7c5cff", "#22d3ee", "#34d399", "#fbbf24", "#fb5e6c", "#f472b6"];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    piece.style.animationDelay = Math.random() * 0.4 + "s";
    piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 4200);
  }
}

/* ===================== Practice feed (endless scroll) ===================== */
let feedPool = [];
let feedCorrect = 0;
let feedCombo = 0;
let feedObserver = null;

function buildFeedPool(filterId) {
  feedPool = [];
  COURSES.forEach((course) => {
    if (filterId !== "all" && course.id !== filterId) return;
    course.units.forEach((u) => u.lessons.forEach((l) => l.exercises.forEach((ex) => {
      if (ex.t === "mc" || ex.t === "fill" || ex.t === "type" || ex.t === "code") feedPool.push({ ex, course });
    })));
  });
}

function initPracticeFilter() {
  const sel = $("practiceFilter");
  sel.innerHTML = '<option value="all">🌐 All languages</option>' +
    COURSES.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  sel.addEventListener("change", () => startFeed(sel.value));
}

function startFeed(filterId) {
  buildFeedPool(filterId);
  const feed = $("feed");
  feed.innerHTML = "";
  feedCorrect = 0;
  feedCombo = 0;
  renderFeedScore();
  appendFeedCards(4);
  feed.scrollTop = 0;
}

function renderFeedScore() {
  $("feedCorrect").textContent = feedCorrect;
  $("feedCombo").textContent = feedCombo;
}

function appendFeedCards(n) {
  const feed = $("feed");
  if (feedObserver) feedObserver.disconnect();
  for (let i = 0; i < n; i++) {
    const pick = feedPool[Math.floor(Math.random() * feedPool.length)];
    if (!pick) return;
    feed.appendChild(buildFeedCard(pick.ex, pick.course));
  }
  // when the last card becomes visible, load more
  const last = feed.lastElementChild;
  if (last) {
    feedObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        feedObserver.disconnect();
        appendFeedCards(4);
      }
    }, { root: feed, threshold: 0.4 });
    feedObserver.observe(last);
  }
}

function buildFeedCard(ex, course) {
  const cardEl = document.createElement("section");
  cardEl.className = "feed-card";
  cardEl.style.setProperty("--cc", course.color);

  const langChip = document.createElement("div");
  langChip.className = "fc-lang";
  langChip.textContent = `${course.badge} · ${course.name}`;
  cardEl.appendChild(langChip);

  const q = document.createElement("div");
  q.className = "fc-q";
  q.textContent = ex.q;
  cardEl.appendChild(q);
  if (ex.code && ex.t !== "fill") addCode(cardEl, ex.code);

  const fbEl = document.createElement("div");
  fbEl.className = "fc-feedback";

  const grade = (ok, correctText) => {
    fbEl.className = "fc-feedback " + (ok ? "good" : "bad");
    fbEl.innerHTML = ok
      ? `✅ Correct! +${XP_PER_CORRECT} XP`
      : `❌ The answer was <code>${escapeHtml(correctText)}</code>`;
    if (ok) {
      feedCorrect++;
      feedCombo++;
      dailyData().correct++;
      clearMistake(ex, course.id);
      addXp(XP_PER_CORRECT);
      bumpStreak();
      saveState();
      floatAt(q, `+${XP_PER_CORRECT} XP`);
      if (feedCombo > 0 && feedCombo % 5 === 0) { sfx.combo(); floatAt(q, `🔥 ${feedCombo} combo!`); }
      else dingGood();
    } else {
      feedCombo = 0;
      recordMistake(ex, course.id);
      fbEl.appendChild(makeAskCoachBtn(ex, course.name, null));
      dingBad();
    }
    renderFeedScore();
    const next = document.createElement("div");
    next.className = "fc-next";
    next.textContent = "scroll for the next one ⌄";
    cardEl.appendChild(next);
  };

  if (ex.t === "mc" || ex.t === "fill") {
    let codeEl = null;
    let blank = null;
    if (ex.t === "fill") {
      codeEl = addCode(cardEl, " ");
      const parts = ex.code.split("___");
      blank = document.createElement("span");
      blank.className = "blank";
      blank.textContent = " ";
      codeEl.textContent = "";
      codeEl.append(document.createTextNode(parts[0]), blank, document.createTextNode(parts[1] ?? ""));
    }
    const list = document.createElement("div");
    list.className = "choices";
    let graded = false;
    const orderIdx = shuffle(ex.choices.map((_, i) => i));
    const buttons = orderIdx.map((origIdx) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<code>${escapeHtml(ex.choices[origIdx])}</code>`;
      b.addEventListener("click", () => {
        if (graded) return;
        graded = true;
        const ok = origIdx === ex.a;
        if (blank) { blank.textContent = ex.choices[origIdx]; blank.classList.add("filled"); }
        buttons.forEach((x, i2) => {
          x.disabled = true;
          if (orderIdx[i2] === ex.a) x.classList.add("correct");
          else if (orderIdx[i2] === origIdx && !ok) x.classList.add("wrong");
        });
        grade(ok, ex.choices[ex.a]);
      });
      list.appendChild(b);
      return b;
    });
    cardEl.appendChild(list);
  } else { // type the output, or write real code
    const isCode = ex.t === "code";
    const input = document.createElement("input");
    input.className = isCode ? "code-input" : "type-input";
    input.placeholder = isCode ? "type the code here…" : "Type your answer…";
    input.autocapitalize = "off";
    input.autocomplete = "off";
    input.setAttribute("autocorrect", "off");
    input.spellcheck = false;
    const check = document.createElement("button");
    check.className = "big-btn fc-check";
    check.textContent = "CHECK";
    let graded = false;
    const doCheck = () => {
      if (graded || !input.value.trim()) return;
      graded = true;
      input.disabled = true;
      check.disabled = true;
      const ok = isCode
        ? gradeCode(ex, input.value)
        : [ex.a, ...(ex.alt || [])].map(normalizeTyped).includes(normalizeTyped(input.value));
      grade(ok, ex.a);
      if (!ok && isCode) requestAiNote(ex, input.value, course.name, fbEl);
    };
    check.addEventListener("click", doCheck);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doCheck(); });
    if (isCode) {
      const editor = document.createElement("div");
      editor.className = "code-editor";
      editor.innerHTML = '<span class="gutter">1</span>';
      editor.appendChild(input);
      cardEl.append(editor, check);
    } else {
      cardEl.append(input, check);
    }
  }

  cardEl.appendChild(fbEl);
  return cardEl;
}

/* ===================== Smart practice (AI-generated from your mistakes) ===================== */
async function aiGenerateQuestions(spots) {
  const list = spots.slice(0, 6);
  const lines = list.map((w, i) =>
    `${i}: [${w.course.name}] Q: ${w.ex.q}` +
    (w.ex.code ? ` | code: ${String(w.ex.code).replace(/\n/g, " ⏎ ")}` : "") +
    ` | correct: ${w.ex.choices ? w.ex.choices[w.ex.a] : w.ex.a}`).join("\n");
  const res = await fetch(AI_FEEDBACK.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + AI_FEEDBACK.key },
    body: JSON.stringify({
      model: AI_FEEDBACK.model,
      temperature: 0.6,
      max_tokens: 900,
      messages: [
        { role: "system", content: 'You write NEW beginner quiz questions for a coding app. Reply with ONLY a JSON array — no markdown, no prose. One item per input line, same order. Item shape: {"src": <input line number>, "q": "question text", "code": "code snippet or null", "choices": ["correct answer", "wrong", "wrong", "wrong"]}. Each question must test the SAME concept in the SAME programming language as its input line, but be a DIFFERENT question (change the values, variable names or angle). choices[0] must be the only correct answer. Keep questions short and beginner-friendly.' },
        { role: "user", content: lines },
      ],
    }),
  });
  const data = await res.json();
  let text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  text = text.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
  const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  const out = [];
  arr.forEach((item) => {
    const srcIdx = Number(item.src);
    const src = list[srcIdx];
    if (!src || !item.q || !Array.isArray(item.choices) || item.choices.length < 3) return;
    out.push({
      ex: {
        t: "mc", gen: true,
        srcKey: mistakeKey(src.course.id, src.ex),
        q: String(item.q),
        ...(item.code && item.code !== "null" ? { code: String(item.code) } : {}),
        choices: item.choices.map(String).slice(0, 4),
        a: 0,
      },
      course: src.course,
    });
  });
  return out;
}

let targetLoading = false;
async function renderTarget() {
  const spots = weakSpots();
  $("analysisPanel").classList.add("hidden");
  const feed = $("targetFeed");
  if (!spots.length) {
    $("targetCount").textContent = "AI practice built from your mistakes";
    feed.innerHTML = `
      <div class="target-empty">
        <div class="result-emoji">🏖️</div>
        <h3>No weak spots!</h3>
        <p>When you miss questions in lessons or practice, the AI will write fresh new questions here that target exactly what tripped you up.</p>
      </div>`;
    return;
  }
  if (targetLoading) return;
  targetLoading = true;
  $("targetCount").textContent = `${spots.length} weak spot${spots.length === 1 ? "" : "s"} found`;
  feed.innerHTML = `
    <div class="target-empty">
      <div class="result-emoji">🤖</div>
      <h3>Writing your questions…</h3>
      <p>The AI is creating brand-new questions that target exactly what you've been getting wrong.</p>
    </div>`;
  let cards = [];
  try {
    if (typeof AI_FEEDBACK === "undefined" || !AI_FEEDBACK || !AI_FEEDBACK.key) throw new Error("no ai");
    cards = await aiGenerateQuestions(spots);
  } catch (e) { /* fall back to replaying the originals below */ }
  feed.innerHTML = "";
  if (cards.length) {
    $("targetCount").textContent = `${cards.length} fresh AI questions — beat them to clear your weak spots`;
    cards.forEach(({ ex, course }) => feed.appendChild(buildFeedCard(ex, course)));
  } else {
    $("targetCount").textContent = "AI unavailable — replaying your missed questions instead";
    spots.forEach(({ ex, course }) => feed.appendChild(buildFeedCard(ex, course)));
  }
  targetLoading = false;
}

$("analyzeBtn").addEventListener("click", async () => {
  const panel = $("analysisPanel");
  panel.classList.remove("hidden");
  if (typeof AI_FEEDBACK === "undefined" || !AI_FEEDBACK || !AI_FEEDBACK.key) {
    panel.textContent = "AI isn't configured (see ai-config.js).";
    return;
  }
  const spots = weakSpots();
  if (!spots.length) {
    panel.textContent = "🤖 Nothing to analyze — you have no recorded mistakes. Go make some! 😄";
    return;
  }
  panel.textContent = "🤖 Analyzing your mistakes…";
  const list = spots.slice(0, 12).map((w) => `- [${w.course.name}] ${w.ex.q} (missed ${w.count}×)`).join("\n");
  try {
    const res = await fetch(AI_FEEDBACK.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + AI_FEEDBACK.key },
      body: JSON.stringify({
        model: AI_FEEDBACK.model,
        temperature: 0.4,
        max_tokens: 160,
        messages: [
          { role: "system", content: "You are a coding tutor. Given a student's missed questions, write 2-3 short sentences: name the topic patterns they struggle with and give ONE concrete tip. Speak directly to the student. No lists, no headings." },
          { role: "user", content: "My missed questions:\n" + list },
        ],
      }),
    });
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    panel.textContent = msg ? "🤖 " + msg.trim() : "Couldn't analyze right now — try again in a minute.";
  } catch (e) {
    panel.textContent = "Couldn't reach the AI right now — try again in a minute.";
  }
});

/* ===================== AI coach chat ===================== */
const chatHistory = [];

function mdLite(s) {
  let t = escapeHtml(s);
  t = t.replace(/```[a-z]*\n?([\s\S]*?)```/g, (_, code) => `<pre>${code.trim()}</pre>`);
  t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  return t.replace(/\n/g, "<br>");
}

function addMsg(who, html) {
  const log = $("chatLog");
  const el = document.createElement("div");
  el.className = "msg " + who;
  el.innerHTML = html;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

/* "Ask the coach" — jumps into the chat with the missed question pre-loaded */
function askCoachAbout(ex, courseName, typed) {
  let text = `I got this ${courseName} question wrong:\n"${ex.q}"`;
  if (ex.code) text += `\nThe code shown:\n${ex.code}`;
  if (ex.a && (ex.t === "type" || ex.t === "code")) text += `\nCorrect answer: ${ex.a}`;
  else if (ex.choices) text += `\nCorrect answer: ${ex.choices[ex.a]}`;
  if (typed) text += `\nMy answer: ${typed}`;
  text += "\nCan you explain it simply?";
  openCoach();
  coachSend(text);
}

function makeAskCoachBtn(ex, courseName, typed) {
  const b = document.createElement("button");
  b.className = "ask-coach-btn";
  b.textContent = "💬 Ask the coach";
  b.addEventListener("click", () => askCoachAbout(ex, courseName, typed));
  return b;
}

function coachSystemPrompt() {
  const spots = weakSpots().slice(0, 5).map((w) => `[${w.course.name}] ${w.ex.q}`).join("; ");
  const name = profile && profile.name !== "Guest" ? profile.name : "the student";
  return `You are Kodexa Coach, a friendly, encouraging tutor inside a code-learning app that teaches 29 programming languages. You are talking to ${name} (level ${levelProgress(state.xp).lvl}, ${state.xp} XP, ${state.streak}-day streak). ${spots ? "Their recent weak spots: " + spots + "." : ""} Answer beginner questions about programming clearly and briefly (under 120 words). Use short code examples in backticks when helpful. Stay on the topic of coding and learning to code.`;
}

let coachBusy = false;
async function coachSend(text) {
  if (coachBusy) return;
  if (typeof AI_FEEDBACK === "undefined" || !AI_FEEDBACK || !AI_FEEDBACK.key) {
    addMsg("ai", "AI isn't configured (see ai-config.js).");
    return;
  }
  coachBusy = true;
  chatHistory.push({ role: "user", content: text });
  addMsg("user", escapeHtml(text));
  const typing = addMsg("ai", '<span class="typing">●●●</span>');
  try {
    const res = await fetch(AI_FEEDBACK.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + AI_FEEDBACK.key },
      body: JSON.stringify({
        model: AI_FEEDBACK.model,
        temperature: 0.5,
        max_tokens: 350,
        messages: [{ role: "system", content: coachSystemPrompt() }, ...chatHistory.slice(-10)],
      }),
    });
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (msg) {
      chatHistory.push({ role: "assistant", content: msg });
      typing.innerHTML = mdLite(msg.trim());
    } else {
      typing.textContent = "Hmm, I couldn't think of a reply — try again?";
    }
  } catch (e) {
    typing.textContent = "⚠️ Couldn't reach the AI right now — check your connection and try again.";
  }
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
  coachBusy = false;
}

$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) return;
  $("chatInput").value = "";
  coachSend(text);
});

function openCoach() {
  show("coachScreen");
  $("coachBack").classList.toggle("hidden", !lesson);
  if (!$("chatLog").children.length) {
    const name = profile && profile.name !== "Guest" ? ", " + profile.name : "";
    addMsg("ai", `Hey${escapeHtml(name)}! 👋 I'm your coding coach. Ask me anything — what an error means, how a loop works, which language to learn next… I also know your weak spots from Targeted Practice, so ask me what to work on!`);
  }
  setTimeout(() => $("chatInput").focus(), 100);
}

$("coachBack").addEventListener("click", () => {
  if (lesson) show("lessonScreen");
  else show("homeScreen");
});

/* ===================== Code playground =====================
 * JS runs instantly in a sandboxed iframe; HTML/CSS render a live
 * preview; most other languages run on real compilers via the free
 * Wandbox API (wandbox.org). */
const WANDBOX_URL = "https://wandbox.org/api/compile.json";

const PLAY = {
  js: { mode: "js", starter: 'console.log("Hello, World!");\n\nfor (let i = 1; i <= 3; i++) {\n  console.log("Count: " + i);\n}' },
  html: { mode: "html", starter: "<h1>Hello!</h1>\n<p>Edit me, then press Run to see the page.</p>\n<button onclick=\"alert('You clicked!')\">Click me</button>" },
  css: { mode: "css", starter: "h1 {\n  color: hotpink;\n}\n\np {\n  font-family: sans-serif;\n  color: #444;\n}\n\nbutton {\n  background: gold;\n  border: none;\n  padding: 10px 18px;\n  border-radius: 8px;\n}" },
  sql: { mode: "sql", compiler: "sqlite-3.46.1", starter: "CREATE TABLE users (name TEXT, age INT);\nINSERT INTO users VALUES ('Ada', 36), ('Linus', 55);\nSELECT * FROM users WHERE age > 40;" },
  python: { mode: "python", compiler: "cpython-3.13.8", starter: 'print("Hello, World!")\n\nfor i in range(1, 4):\n    print("Count:", i)' },
  typescript: { mode: "ts", compiler: "typescript-5.6.2", starter: 'const greet = (name: string): string => `Hi ${name}`;\nconsole.log(greet("World"));' },
  java: { mode: "wandbox", compiler: "openjdk-jdk-22+36", starter: 'class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}' },
  csharp: { mode: "wandbox", compiler: "mono-6.12.0.199", starter: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello, World!");\n    }\n}' },
  cpp: { mode: "wandbox", compiler: "gcc-13.2.0", starter: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}' },
  c: { mode: "wandbox", compiler: "gcc-13.2.0-c", starter: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}' },
  go: { mode: "wandbox", compiler: "go-1.23.2", starter: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}' },
  rust: { mode: "wandbox", compiler: "rust-1.82.0", starter: 'fn main() {\n    println!("Hello, World!");\n}' },
  php: { mode: "wandbox", compiler: "php-8.3.12", starter: '<?php\necho "Hello, World!\\n";\nfor ($i = 1; $i <= 3; $i++) {\n    echo "Count: $i\\n";\n}' },
  ruby: { mode: "wandbox", compiler: "ruby-3.4.9", starter: 'puts "Hello, World!"\n\n3.times do |i|\n  puts "Count: #{i + 1}"\nend' },
  swift: { mode: "wandbox", compiler: "swift-6.0.1", starter: 'print("Hello, World!")\n\nfor i in 1...3 {\n    print("Count: \\(i)")\n}' },
  scala: { mode: "wandbox", compiler: "scala-2.13.15", starter: 'object Main {\n  def main(args: Array[String]): Unit = {\n    println("Hello, World!")\n  }\n}' },
  haskell: { mode: "wandbox", compiler: "ghc-9.10.1", starter: 'main :: IO ()\nmain = do\n  putStrLn "Hello, World!"\n  mapM_ print [1, 2, 3]' },
  julia: { mode: "wandbox", compiler: "julia-1.10.5", starter: 'println("Hello, World!")\n\nfor i in 1:3\n    println("Count: $i")\nend' },
  elixir: { mode: "wandbox", compiler: "elixir-1.17.3", starter: 'IO.puts("Hello, World!")\n\nEnum.each(1..3, fn i ->\n  IO.puts("Count: #{i}")\nend)' },
  pascal: { mode: "wandbox", compiler: "fpc-3.2.2", starter: "program Hello;\nvar\n  i: Integer;\nbegin\n  writeln('Hello, World!');\n  for i := 1 to 3 do\n    writeln('Count: ', i);\nend." },
  bash: { mode: "wandbox", compiler: "bash", starter: 'echo "Hello, World!"\n\nfor i in 1 2 3; do\n  echo "Count: $i"\ndone' },
  lua: { mode: "lua", compiler: "lua-5.4.7", starter: 'print("Hello, World!")\n\nfor i = 1, 3 do\n  print("Count: " .. i)\nend' },
  r: { mode: "wandbox", compiler: "r-4.4.1", starter: 'cat("Hello, World!\\n")\n\nfor (i in 1:3) {\n  cat("Count:", i, "\\n")\n}' },
  perl: { mode: "wandbox", compiler: "perl-5.42.0", starter: 'print "Hello, World!\\n";\n\nfor my $i (1..3) {\n    print "Count: $i\\n";\n}' },
  kotlin: { mode: "none", starter: 'fun main() {\n    println("Hello, World!")\n}' },
  dart: { mode: "none", starter: "void main() {\n  print('Hello, World!');\n}" },
  matlab: { mode: "none", starter: "disp('Hello, World!')" },
  objc: { mode: "none", starter: '#import <Foundation/Foundation.h>\n\nint main() {\n    NSLog(@"Hello, World!");\n    return 0;\n}' },
  vb: { mode: "none", starter: 'Module Program\n    Sub Main()\n        Console.WriteLine("Hello, World!")\n    End Sub\nEnd Module' },
};

/* Local WASM engines: Python, Lua, SQL and TypeScript run fully in the
 * browser — no cloud needed. Downloaded once from a CDN, then cached. */
const _scriptPromises = {};
function loadScriptOnce(src) {
  if (!_scriptPromises[src]) {
    _scriptPromises[src] = new Promise((ok, bad) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => { delete _scriptPromises[src]; bad(new Error("script load failed")); };
      document.head.appendChild(s);
    });
  }
  return _scriptPromises[src];
}

let pyodideP = null;
async function runPythonLocal(code) {
  let py;
  try {
    if (!pyodideP) {
      showPlayOut("⏳ Setting up Python in your browser (one-time download)…");
      pyodideP = loadScriptOnce("https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js")
        .then(() => loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" }));
    }
    py = await pyodideP;
  } catch (e) {
    pyodideP = null;
    return runWandbox(PLAY.python.compiler, code); // engine didn't load — use the cloud
  }
  showPlayOut("⏳ Running…");
  const out = [];
  py.setStdout({ batched: (s) => out.push(s) });
  py.setStderr({ batched: (s) => out.push("⚠️ " + s) });
  let errText = "";
  try {
    await py.runPythonAsync(code);
  } catch (e) {
    errText = String(e.message || e);
    const lines = errText.trim().split("\n");
    out.push("⚠️ " + lines.slice(-3).join("\n"));
  }
  showPlayOut(out.join("\n") || "(no output — try print()!)");
  if (errText) explainPlayError(code, errText);
}

let luaReady = null;
async function runLuaLocal(code) {
  try {
    if (!luaReady) {
      showPlayOut("⏳ Setting up Lua in your browser (one-time download)…");
      luaReady = loadScriptOnce("https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js");
    }
    await luaReady;
  } catch (e) {
    luaReady = null;
    return runWandbox(PLAY.lua.compiler, code);
  }
  showPlayOut("⏳ Running…");
  const out = [];
  window.__luaPrint = (s) => out.push(String(s));
  const wrapped =
    'local js = require "js"\n' +
    "print = function(...)\n" +
    "  local t = {}\n" +
    "  for i = 1, select('#', ...) do t[#t+1] = tostring(select(i, ...)) end\n" +
    "  js.global:__luaPrint(table.concat(t, '\\t'))\n" +
    "end\n" + code;
  let errText = "";
  try {
    fengari.load(wrapped)();
  } catch (e) {
    errText = String(e.message || e);
    out.push("⚠️ " + errText);
  }
  showPlayOut(out.join("\n") || "(no output — try print()!)");
  if (errText) explainPlayError(code, errText);
}

let sqlJsP = null;
async function runSqlLocal(code) {
  let SQL;
  try {
    if (!sqlJsP) {
      showPlayOut("⏳ Setting up SQLite in your browser (one-time download)…");
      sqlJsP = loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js")
        .then(() => initSqlJs({ locateFile: (f) => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/" + f }));
    }
    SQL = await sqlJsP;
  } catch (e) {
    sqlJsP = null;
    return runWandbox(PLAY.sql.compiler, code);
  }
  showPlayOut("⏳ Running…");
  try {
    const db = new SQL.Database();
    const results = db.exec(code);
    let out = "";
    results.forEach((r) => {
      out += r.columns.join(" | ") + "\n";
      out += r.columns.map(() => "—").join("-|-") + "\n";
      r.values.forEach((row) => { out += row.join(" | ") + "\n"; });
      out += "\n";
    });
    db.close();
    showPlayOut(out.trim() || "✅ Statements ran fine (no rows to show — add a SELECT!)");
  } catch (e) {
    const errText = String(e.message || e);
    showPlayOut("⚠️ " + errText);
    explainPlayError(code, errText);
  }
}

let tsP = null;
async function runTsLocal(code) {
  try {
    if (!tsP) {
      showPlayOut("⏳ Setting up TypeScript in your browser (one-time download)…");
      tsP = loadScriptOnce("https://cdn.jsdelivr.net/npm/typescript@5.6.2/lib/typescript.min.js");
    }
    await tsP;
    const js = window.ts.transpile(code, { target: 99 });
    runJsLocally(js, code);
  } catch (e) {
    tsP = null;
    runWandbox(PLAY.typescript.compiler, code);
  }
}

const playBuffers = {};
let playCurrent = "js";

function initPlayground() {
  const sel = $("playLang");
  sel.innerHTML = COURSES.filter((c) => PLAY[c.id])
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}${PLAY[c.id].mode === "none" ? " (read-only)" : ""}</option>`)
    .join("");
  sel.value = playCurrent;
  $("playEditor").value = PLAY[playCurrent].starter;
  sel.addEventListener("change", () => {
    playBuffers[playCurrent] = $("playEditor").value;
    playCurrent = sel.value;
    $("playEditor").value = playBuffers[playCurrent] ?? PLAY[playCurrent].starter;
    showPlayOut(PLAY[playCurrent].mode === "none"
      ? "ℹ️ This language needs a full toolchain and can't run in the browser yet — but JS, Python, Java, C++ and 20 others can!"
      : "Press ▶ Run to see your output here.");
  });
  // Tab inserts two spaces instead of leaving the editor
  $("playEditor").addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const t = e.target;
      const s = t.selectionStart;
      t.value = t.value.slice(0, s) + "  " + t.value.slice(t.selectionEnd);
      t.selectionStart = t.selectionEnd = s + 2;
    }
  });
  $("playRun").addEventListener("click", runPlayground);
}

function showPlayOut(text) {
  $("playPreview").classList.add("hidden");
  $("playAiNote").classList.add("hidden");
  $("playOut").classList.remove("hidden");
  $("playOut").textContent = text;
}

/* When the user's playground code errors, ask the AI what they meant
 * and what went wrong. */
let playAiToken = 0;
async function explainPlayError(code, errText) {
  if (typeof AI_FEEDBACK === "undefined" || !AI_FEEDBACK || !AI_FEEDBACK.key) return;
  const token = ++playAiToken;
  const note = $("playAiNote");
  note.classList.remove("hidden");
  note.textContent = "🤖 Reading your error…";
  try {
    const langName = (courseById(playCurrent) || { name: playCurrent }).name;
    const res = await fetch(AI_FEEDBACK.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + AI_FEEDBACK.key },
      body: JSON.stringify({
        model: AI_FEEDBACK.model,
        temperature: 0.3,
        max_tokens: 140,
        messages: [
          { role: "system", content: "A beginner's code produced an error in a code playground. Reply in EXACTLY this format and nothing else:\nIf you were trying to <their goal, max 8 words>, try: <the single corrected line of code>\nUse the same programming language they wrote. Plain text only — no markdown, no backticks, no extra sentences." },
          { role: "user", content: `Language: ${langName}\nTheir code:\n${code.slice(0, 1500)}\n\nThe error:\n${errText.slice(0, 800)}` },
        ],
      }),
    });
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (token !== playAiToken) return; // a newer run started
    if (msg && msg.trim()) note.textContent = "🤖 " + msg.trim();
    else note.classList.add("hidden");
  } catch (e) {
    if (token === playAiToken) note.classList.add("hidden");
  }
}

function showPlayPreview(srcdoc) {
  $("playOut").classList.add("hidden");
  $("playPreview").classList.remove("hidden");
  $("playPreview").srcdoc = srcdoc;
}

let playMsgHandler = null;
function runJsLocally(code, sourceForAi) {
  showPlayOut("⏳ Running…");
  const tag = "kodexa-run-" + Date.now();
  if (playMsgHandler) window.removeEventListener("message", playMsgHandler);
  playMsgHandler = (e) => {
    if (!e.data || e.data.tag !== tag) return;
    showPlayOut(e.data.lines.length ? e.data.lines.join("\n") : "(no output — try console.log!)");
    const errLines = e.data.lines.filter((l) => l.startsWith("⚠️"));
    if (errLines.length) explainPlayError(sourceForAi || code, errLines.join("\n"));
  };
  window.addEventListener("message", playMsgHandler);
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.srcdoc = "<scr" + "ipt>" +
    "const lines=[];" +
    'const fmt=(x)=>{try{return typeof x==="object"?JSON.stringify(x):String(x);}catch(e){return String(x);}};' +
    "const P=(...a)=>lines.push(a.map(fmt).join(' '));" +
    "console.log=P;console.warn=P;console.error=(...a)=>P('⚠️',...a);" +
    "try{eval(" + JSON.stringify(code) + ");}catch(e){P('⚠️ '+e.message);}" +
    "setTimeout(()=>parent.postMessage({tag:" + JSON.stringify(tag) + ",lines},'*'),250);" +
    "</scr" + "ipt>";
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 4000);
}

/* Transient server-side sandbox failures from the free runner — retryable */
const WANDBOX_BUSY = /OCI runtime|crun:|Resource temporarily unavailable|try again/i;

async function runWandbox(compiler, code) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    showPlayOut(attempt === 1
      ? "⏳ Running on a real compiler in the cloud… (a few seconds)"
      : `⏳ The cloud runner was busy — retrying (${attempt}/3)…`);
    try {
      const res = await fetch(WANDBOX_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compiler, code }),
      });
      const d = await res.json();
      const all = `${d.compiler_error || ""}${d.program_error || ""}${d.program_output || ""}`;
      if (WANDBOX_BUSY.test(all) && attempt < 3) {
        await new Promise((ok) => setTimeout(ok, attempt * 1500));
        continue;
      }
      if (WANDBOX_BUSY.test(all)) {
        showPlayOut("😮‍💨 The free cloud runner is overloaded right now (lots of people compiling!).\nYour code is fine — wait a few seconds and press ▶ Run again.");
        return;
      }
      let out = "";
      if (d.compiler_error) out += "🛠️ Compiler says:\n" + d.compiler_error + "\n";
      if (d.program_output) out += d.program_output;
      if (d.program_error) out += "⚠️ " + d.program_error;
      showPlayOut(out.trim() || "(no output)");
      const errText = `${d.compiler_error || ""}${d.program_error || ""}`.trim();
      if (errText) explainPlayError(code, errText);
      return;
    } catch (e) {
      if (attempt === 3) showPlayOut("⚠️ Couldn't reach the cloud runner — check your connection and try again.");
      else await new Promise((ok) => setTimeout(ok, attempt * 1500));
    }
  }
}

function runPlayground() {
  const cfg = PLAY[playCurrent];
  const code = $("playEditor").value;
  sfx.select();
  if (cfg.mode === "js") runJsLocally(code);
  else if (cfg.mode === "python") runPythonLocal(code);
  else if (cfg.mode === "lua") runLuaLocal(code);
  else if (cfg.mode === "sql") runSqlLocal(code);
  else if (cfg.mode === "ts") runTsLocal(code);
  else if (cfg.mode === "html") showPlayPreview(code);
  else if (cfg.mode === "css") showPlayPreview(
    `<style>${code}</style><h1>Style me!</h1><p>This paragraph is your canvas. Change the CSS and press Run again.</p><button>A button</button>`);
  else if (cfg.mode === "wandbox") runWandbox(cfg.compiler, code);
  else showPlayOut("ℹ️ This language needs a full toolchain and can't run in the browser yet — but JS, Python, Java, C++ and 20 others can!");
}

/* ===================== Unit guidebook (auto cheat sheet) ===================== */
function unitCheats(unit) {
  const out = [];
  unit.lessons.forEach((l) => l.exercises.forEach((ex) => {
    if (ex.t === "code") out.push(ex.a);
    else if (ex.code && String(ex.code).includes("___") && ex.choices) out.push(String(ex.code).replace("___", ex.choices[ex.a]));
    else if (ex.code) out.push(String(ex.code));
  }));
  return [...new Set(out)].slice(0, 8);
}

function openGuidebook(unit, course) {
  const cheats = unitCheats(unit);
  $("guideCard").innerHTML = `
    <div class="guide-head">
      <span class="cc-badge" style="background:${course.color}">${escapeHtml(course.badge)}</span>
      <div>
        <h2>${escapeHtml(unit.title)}</h2>
        <p>${escapeHtml(unit.desc)}</p>
      </div>
    </div>
    ${cheats.length
      ? '<div class="guide-label">📖 Code you\'ll meet in this unit</div>' +
        cheats.map((c) => `<pre class="guide-snippet">${escapeHtml(c)}</pre>`).join("")
      : '<p class="guide-none">This unit is concept questions — no cheat sheet needed. You\'ve got this! 💪</p>'}
    <button class="big-btn" id="guideClose">GOT IT</button>`;
  $("guideSheet").classList.remove("hidden");
  $("guideClose").addEventListener("click", closeGuidebook);
  sfx.tap();
}
function closeGuidebook() { $("guideSheet").classList.add("hidden"); }
$("guideSheet").addEventListener("click", (e) => { if (e.target === $("guideSheet")) closeGuidebook(); });

/* ===================== Profile sheet ===================== */
function openProfile() {
  const lessonsDone = Object.keys(state.completed).length;
  $("profileCard").innerHTML = `
    <div class="avatar">${profile ? (profile.name[0] || "?").toUpperCase() : "?"}</div>
    <h2>${escapeHtml(profile ? profile.name : "Guest")}</h2>
    <div class="email">${escapeHtml(profile && profile.email ? profile.email : `Signed in with ${profile ? profile.method : "—"}`)}</div>
    <div class="sheet-stats">
      <span><b>${levelProgress(state.xp).lvl}</b>level</span>
      <span><b>${state.xp}</b>XP</span>
      <span><b>${state.streak}</b>day streak</span>
      <span><b>${state.gems}</b>gems</span>
      <span><b>${lessonsDone}</b>lessons</span>
    </div>
    <button class="big-btn ghost" id="sheetClose">Close</button>
    <button class="big-btn ghost" id="sheetSignout">Sign out</button>
    <button class="big-btn bad" id="sheetReset">Reset all progress</button>`;
  $("profileSheet").classList.remove("hidden");
  $("sheetClose").addEventListener("click", closeProfile);
  $("sheetSignout").addEventListener("click", () => {
    if (fbAuth && fbAuth.currentUser) fbAuth.signOut().catch(() => {});
    cloudUid = null;
    localStorage.removeItem(PROFILE_KEY);
    profile = null;
    closeProfile();
    show("authScreen");
  });
  $("sheetReset").addEventListener("click", () => {
    if (confirm("Reset ALL progress (XP, gems, streak and completed lessons)?")) {
      localStorage.removeItem(STORAGE_KEY);
      state = loadState();
      closeProfile();
      enterApp();
    }
  });
}
function closeProfile() { $("profileSheet").classList.add("hidden"); }
$("profileSheet").addEventListener("click", (e) => { if (e.target === $("profileSheet")) closeProfile(); });

/* ===================== Nav ===================== */
$("navLearn").addEventListener("click", () => { renderHome(); renderHeader(); show("homeScreen"); });
$("navPractice").addEventListener("click", () => {
  show("practiceScreen");
  if (!$("feed").children.length) startFeed($("practiceFilter").value);
});
$("navTarget").addEventListener("click", () => {
  renderTarget();
  show("targetScreen");
});
$("navPlay").addEventListener("click", () => show("playScreen"));
$("navCoach").addEventListener("click", openCoach);
$("navProfile").addEventListener("click", openProfile);
$("avatarBtn").addEventListener("click", openProfile);

/* ===================== Boot ===================== */
initAuth();
initPracticeFilter();
initPlayground();
if (profile) enterApp();
else show("authScreen");
