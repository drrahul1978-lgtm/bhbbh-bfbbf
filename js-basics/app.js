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
  const s = { xp: 0, gems: 0, streak: 0, lastDay: null, completed: {}, chests: {}, ...(raw || {}) };
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
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

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
const SCREENS = ["authScreen", "homeScreen", "courseScreen", "lessonScreen", "resultScreen", "practiceScreen"];

function show(id) {
  SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  const el = $(id);
  el.classList.remove("screen-anim");
  void el.offsetWidth; // restart the entrance animation
  el.classList.add("screen-anim");
  const inApp = id !== "authScreen";
  $("topbar").classList.toggle("hidden", !inApp || id === "lessonScreen" || id === "practiceScreen");
  $("bottomnav").classList.toggle("hidden", !inApp || id === "lessonScreen" || id === "resultScreen");
  $("navLearn").classList.toggle("active", id === "homeScreen" || id === "courseScreen");
  $("navPractice").classList.toggle("active", id === "practiceScreen");
  if (id !== "practiceScreen") window.scrollTo(0, 0);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHeader() {
  $("statStreak").textContent = state.streak;
  $("statGems").textContent = state.gems;
  $("statXp").textContent = state.xp;
  $("avatarBtn").textContent = profile ? (profile.name[0] || "?").toUpperCase() : "?";
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
  document.querySelectorAll("#authButtons [data-method]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const method = btn.dataset.method;
      const name = prompt(`What should we call you? (${method} sign-in is simulated — everything stays on this device)`, "Coder");
      if (name === null) return;
      completeAuth({ name: name.trim() || "Coder", email: `${method.toLowerCase()}-user@device.local`, method });
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
  $("emailForm").addEventListener("submit", (e) => {
    e.preventDefault();
    completeAuth({ name: $("authName").value.trim() || "Coder", email: $("authEmail").value.trim(), method: "Email" });
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
function renderHome() {
  $("greeting").innerHTML = profile && profile.name !== "Guest"
    ? `Hey ${escapeHtml(profile.name)} 👋<br>What are we mastering today?`
    : "Pick a language.<br>Master it.";
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

function startLesson(cid, u, l) {
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
    getAnswer: null,
  };
  show("lessonScreen");
  renderLessonChrome();
  nextExercise();
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
  const q = document.createElement("div");
  q.className = "exercise-q";
  q.textContent = ex.q;
  area.appendChild(q);
  if (ex.t === "mc") renderMC(ex, area, setAnswer, onReady);
  else if (ex.t === "fill") renderFill(ex, area, setAnswer, onReady, onNotReady);
  else if (ex.t === "order") renderOrder(ex, area, setAnswer, onReady, onNotReady);
  else if (ex.t === "type") renderType(ex, area, setAnswer, onReady, onNotReady);
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
  if (lesson.checked) { nextExercise(); return; }

  const { ok, correctText } = lesson.getAnswer();
  lesson.checked = true;
  const ex = lesson.queue.shift();
  const fb = $("feedback");
  const btn = $("checkBtn");
  btn.textContent = "CONTINUE";
  btn.disabled = false;

  if (ok) {
    lesson.correct++;
    state.xp += XP_PER_CORRECT;
    saveState();
    renderHeader();
    fb.className = "feedback good";
    $("feedbackTitle").textContent = ["Nice!", "Correct!", "Great job!", "Nailed it!"][Math.floor(Math.random() * 4)];
    $("feedbackDetail").textContent = "+" + XP_PER_CORRECT + " XP";
    btn.className = "big-btn good";
    floatAt(btn, `+${XP_PER_CORRECT} XP`);
    dingGood();
  } else {
    lesson.mistakes++;
    lesson.hearts--;
    lesson.queue.push(ex); // missed questions come back later in the lesson
    fb.className = "feedback bad";
    $("feedbackTitle").textContent = "Not quite…";
    $("feedbackDetail").innerHTML = `Correct answer: <code>${escapeHtml(correctText)}</code>`;
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
    state.xp += XP_LESSON_BONUS + (perfect ? XP_PERFECT_BONUS : 0);
    bumpStreak();
    saveState();
    const earned = XP_LESSON_BONUS + (perfect ? XP_PERFECT_BONUS : 0) + lesson.total * XP_PER_CORRECT;
    const accuracy = Math.round((lesson.total / (lesson.total + lesson.mistakes)) * 100);

    card.innerHTML = `
      <div class="result-mascot">${mascotSVG(c.color)}</div>
      <h1>${perfect ? "Perfect lesson!" : "Lesson complete!"}</h1>
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

function confetti() {
  const colors = ["#7c5cff", "#22d3ee", "#34d399", "#fbbf24", "#fb5e6c", "#f472b6"];
  for (let i = 0; i < 60; i++) {
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
      if (ex.t === "mc" || ex.t === "fill" || ex.t === "type") feedPool.push({ ex, course });
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
      state.xp += XP_PER_CORRECT;
      bumpStreak();
      saveState();
      floatAt(q, `+${XP_PER_CORRECT} XP`);
      if (feedCombo > 0 && feedCombo % 5 === 0) { sfx.combo(); floatAt(q, `🔥 ${feedCombo} combo!`); }
      else dingGood();
    } else {
      feedCombo = 0;
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
  } else { // type
    const input = document.createElement("input");
    input.className = "type-input";
    input.placeholder = "Type your answer…";
    input.autocapitalize = "off";
    input.autocomplete = "off";
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
      const accepted = [ex.a, ...(ex.alt || [])].map(normalizeTyped);
      grade(accepted.includes(normalizeTyped(input.value)), ex.a);
    };
    check.addEventListener("click", doCheck);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doCheck(); });
    cardEl.append(input, check);
  }

  cardEl.appendChild(fbEl);
  return cardEl;
}

/* ===================== Profile sheet ===================== */
function openProfile() {
  const lessonsDone = Object.keys(state.completed).length;
  $("profileCard").innerHTML = `
    <div class="avatar">${profile ? (profile.name[0] || "?").toUpperCase() : "?"}</div>
    <h2>${escapeHtml(profile ? profile.name : "Guest")}</h2>
    <div class="email">${escapeHtml(profile && profile.email ? profile.email : `Signed in with ${profile ? profile.method : "—"}`)}</div>
    <div class="sheet-stats">
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
$("navProfile").addEventListener("click", openProfile);
$("avatarBtn").addEventListener("click", openProfile);

/* ===================== Boot ===================== */
initAuth();
initPracticeFilter();
if (profile) enterApp();
else show("authScreen");
