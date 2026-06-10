/* Kodexa — a Duolingo-style game for learning JavaScript basics.
 * Pure client-side: progress (XP, streak, completed lessons) lives in localStorage. */

"use strict";

/* ===================== Course content =====================
 * Exercise types:
 *   mc    — multiple choice            {t,q,code?,choices,a}
 *   fill  — pick a chip to fill ___    {t,q,code (contains ___),choices,a}
 *   order — arrange chips into code    {t,q,tokens}
 *   type  — type the answer            {t,q,code?,a,alt?}
 */
const UNITS = [
  {
    title: "Unit 1 · First Steps",
    desc: "Say hello to JavaScript",
    color: "#58cc02", colorDark: "#46a302", icon: "👋",
    lessons: [
      {
        title: "Hello, World!",
        exercises: [
          { t: "mc", q: "What does this code do?", code: 'console.log("Hello!");',
            choices: ["Prints Hello! to the console", "Shows a popup window", "Saves a file called Hello", "Nothing — it's a comment"], a: 0 },
          { t: "order", q: "Build the code: print \"Hi\" to the console",
            tokens: ["console", ".", "log", "(", '"Hi"', ")", ";"] },
          { t: "mc", q: "What is the output?", code: "console.log(123);",
            choices: ["123", '"123"', "console", "Nothing"], a: 0 },
          { t: "fill", q: "Fill in the blank to print a message", code: '___("Good morning");',
            choices: ["console.log", "print", "echo"], a: 0 },
          { t: "type", q: "Type the output of this code", code: "console.log(5);", a: "5" },
          { t: "mc", q: "Where can JavaScript run?",
            choices: ["In browsers and on servers (Node.js)", "Only inside Microsoft Word", "Only on phones", "Only on calculators"], a: 0 },
        ],
      },
      {
        title: "Comments & Syntax",
        exercises: [
          { t: "mc", q: "Which symbol starts a single-line comment?",
            choices: ["//", "##", "<!--", "**"], a: 0 },
          { t: "fill", q: "Turn this line into a comment", code: "___ remind me to drink water",
            choices: ["//", "\\\\", "%%"], a: 0 },
          { t: "mc", q: "How do you write a comment that spans many lines?",
            choices: ["/* like this */", "// like this //", "(( like this ))", "## like this ##"], a: 0 },
          { t: "mc", q: "What happens to comments when code runs?",
            choices: ["They are ignored completely", "They print to the console", "They cause errors", "They run twice"], a: 0 },
          { t: "order", q: "Build a single-line comment that says: my first comment",
            tokens: ["//", "my", "first", "comment"] },
          { t: "mc", q: "Which character usually ends a JavaScript statement?",
            choices: [";", ":", ".", "!"], a: 0 },
        ],
      },
    ],
  },
  {
    title: "Unit 2 · Variables",
    desc: "Boxes that store your data",
    color: "#1cb0f6", colorDark: "#1899d6", icon: "📦",
    lessons: [
      {
        title: "Declaring Variables",
        exercises: [
          { t: "mc", q: "Which keyword declares a variable whose value can change?",
            choices: ["let", "make", "variable", "new"], a: 0 },
          { t: "order", q: "Build the code: store 13 in a variable called age",
            tokens: ["let", "age", "=", "13", ";"] },
          { t: "fill", q: "Fill in the blank to assign a value", code: 'let name ___ "Ada";',
            choices: ["=", "==", "=>"], a: 0 },
          { t: "mc", q: "What is the output?", code: "let score = 10;\nconsole.log(score);",
            choices: ["10", "score", '"score"', "undefined"], a: 0 },
          { t: "type", q: "Type the output of this code", code: "let x = 7;\nconsole.log(x);", a: "7" },
          { t: "mc", q: "Which is a valid variable name?",
            choices: ["myScore", "2cool", "my-score", "let"], a: 0 },
        ],
      },
      {
        title: "const vs let",
        exercises: [
          { t: "mc", q: "What does const mean?",
            choices: ["The variable can't be reassigned", "The variable is secret", "The variable is a number", "The variable updates constantly"], a: 0 },
          { t: "mc", q: "What happens here?", code: "const pi = 3.14;\npi = 3;",
            choices: ["An error — you can't reassign a const", "pi becomes 3", "pi becomes 3.14 again", "Nothing"], a: 0 },
          { t: "fill", q: "Your birthday never changes — pick the best keyword", code: '___ birthday = "June 10";',
            choices: ["const", "let", "var"], a: 0 },
          { t: "mc", q: "What is the output?", code: "let x = 1;\nx = 2;\nconsole.log(x);",
            choices: ["2", "1", "12", "Error"], a: 0 },
          { t: "order", q: "Build the code: a constant called name holding \"Rahul\"",
            tokens: ["const", "name", "=", '"Rahul"', ";"] },
          { t: "mc", q: "Which should you reach for by default in modern JavaScript?",
            choices: ["const, switching to let only when you need to reassign", "var everywhere", "let everywhere", "No keyword at all"], a: 0 },
        ],
      },
    ],
  },
  {
    title: "Unit 3 · Data Types",
    desc: "Numbers, strings & booleans",
    color: "#ce82ff", colorDark: "#a560e8", icon: "🧬",
    lessons: [
      {
        title: "Numbers & Strings",
        exercises: [
          { t: "mc", q: "What type of value is \"hello\"?",
            choices: ["string", "number", "boolean", "letter"], a: 0 },
          { t: "mc", q: "What type of value is 42?",
            choices: ["number", "string", "integer-string", "digit"], a: 0 },
          { t: "fill", q: "Make greeting a string", code: "let greeting = ___;",
            choices: ['"Hello"', "Hello", "(Hello)"], a: 0 },
          { t: "mc", q: "What is the result of this expression?", code: '"Hi" + " there"',
            choices: ['"Hi there"', '"Hi+there"', "An error", "0"], a: 0 },
          { t: "type", q: "Type the output of this code", code: 'console.log(typeof "cat");', a: "string" },
          { t: "mc", q: "Joining two strings with + is called…",
            choices: ["concatenation", "addition", "compression", "stringification"], a: 0 },
        ],
      },
      {
        title: "Booleans & typeof",
        exercises: [
          { t: "mc", q: "Which two values can a boolean have?",
            choices: ["true and false", "yes and no", "1 and 2", "on and off"], a: 0 },
          { t: "mc", q: "What is the output?", code: "console.log(typeof true);",
            choices: ['"boolean"', '"true"', '"bool"', '"number"'], a: 0 },
          { t: "fill", q: "Fill in a boolean value", code: "let isHappy = ___;",
            choices: ["true", '"yes"', "happy"], a: 0 },
          { t: "mc", q: "What is the output?", code: "console.log(typeof 99);",
            choices: ['"number"', '"99"', '"string"', '"integer"'], a: 0 },
          { t: "type", q: "Type the output of this code", code: "console.log(typeof 3.14);", a: "number" },
          { t: "mc", q: "Which of these is NOT a JavaScript type?",
            choices: ["letter", "string", "number", "boolean"], a: 0 },
        ],
      },
    ],
  },
  {
    title: "Unit 4 · Operators",
    desc: "Math, comparisons & logic",
    color: "#ff9600", colorDark: "#e08600", icon: "➗",
    lessons: [
      {
        title: "Math Time",
        exercises: [
          { t: "mc", q: "What is the output? (% gives the remainder)", code: "console.log(7 % 2);",
            choices: ["1", "3.5", "2", "0"], a: 0 },
          { t: "type", q: "Type the output of this code", code: "console.log(4 * 5);", a: "20" },
          { t: "fill", q: "Add the price and the tax", code: "let total = price ___ tax;",
            choices: ["+", "&", "plus"], a: 0 },
          { t: "mc", q: "What is the output?", code: "console.log(10 / 4);",
            choices: ["2.5", "2", "3", "2.25"], a: 0 },
          { t: "mc", q: "What does x += 3 mean?",
            choices: ["x = x + 3", "x === 3", "x is at least 3", "Add x to 3 and throw it away"], a: 0 },
          { t: "order", q: "Build the code: store a plus b in a variable called sum",
            tokens: ["let", "sum", "=", "a", "+", "b", ";"] },
        ],
      },
      {
        title: "Comparisons & Logic",
        exercises: [
          { t: "mc", q: "What is the output?", code: 'console.log(5 === "5");',
            choices: ["false", "true", "5", "Error"], a: 0 },
          { t: "mc", q: "Which operator checks value AND type?",
            choices: ["===", "==", "=", "=>"], a: 0 },
          { t: "type", q: "Type the output of this code", code: "console.log(7 > 3);", a: "true" },
          { t: "mc", q: "What is the result of true && false?",
            choices: ["false", "true", "maybe", "Error"], a: 0 },
          { t: "mc", q: "What does !true evaluate to? (! means NOT)",
            choices: ["false", "true", "undefined", "Error"], a: 0 },
          { t: "fill", q: "Both conditions must be true — pick the operator", code: "if (age >= 13 ___ age < 20)",
            choices: ["&&", "||", "++"], a: 0 },
        ],
      },
    ],
  },
  {
    title: "Unit 5 · Conditionals",
    desc: "Teach your code to decide",
    color: "#ff4b4b", colorDark: "#ea2b2b", icon: "🚦",
    lessons: [
      {
        title: "Making Decisions",
        exercises: [
          { t: "mc", q: "An if block runs when its condition is…",
            choices: ["true", "false", "a string", "missing"], a: 0 },
          { t: "fill", q: "Fill in the keyword", code: '___ (temp > 30) {\n  console.log("Hot!");\n}',
            choices: ["if", "when", "check"], a: 0 },
          { t: "mc", q: "What is the output?", code: 'let x = 10;\nif (x > 5) {\n  console.log("big");\n}',
            choices: ["big", "small", "x", "Nothing"], a: 0 },
          { t: "type", q: "Type the output of this code", code: 'let age = 15;\nif (age >= 13) {\n  console.log("teen");\n}', a: "teen" },
          { t: "mc", q: "In an if statement, the condition goes inside…",
            choices: ["parentheses ( )", "curly braces { }", "square brackets [ ]", "quotes \" \""], a: 0 },
          { t: "order", q: "Build the code: if x is greater than 5",
            tokens: ["if", "(", "x", ">", "5", ")"] },
        ],
      },
      {
        title: "Else & Else If",
        exercises: [
          { t: "mc", q: "The else block runs when the if condition is…",
            choices: ["false", "true", "undefined", "an error"], a: 0 },
          { t: "fill", q: "Fill in the keyword", code: 'if (sunny) {\n  console.log("Beach!");\n} ___ {\n  console.log("Movies!");\n}',
            choices: ["else", "otherwise", "or"], a: 0 },
          { t: "mc", q: "What is the output?", code: 'let x = 3;\nif (x > 5) {\n  console.log("big");\n} else {\n  console.log("small");\n}',
            choices: ["small", "big", "3", "Nothing"], a: 0 },
          { t: "mc", q: "Which keyword chains a second condition?",
            choices: ["else if", "elif", "elseif", "also if"], a: 0 },
          { t: "type", q: "Type the output of this code", code: 'let n = 10;\nif (n % 2 === 0) {\n  console.log("even");\n} else {\n  console.log("odd");\n}', a: "even" },
          { t: "order", q: "Build the else branch that prints \"nope\"",
            tokens: ["else", "{", "console.log", "(", '"nope"', ")", ";", "}"] },
        ],
      },
    ],
  },
  {
    title: "Unit 6 · Loops",
    desc: "Repeat without repeating yourself",
    color: "#2ec4b6", colorDark: "#21a99c", icon: "🔁",
    lessons: [
      {
        title: "The for Loop",
        exercises: [
          { t: "mc", q: "What is the correct order of the three parts in a for loop header?",
            choices: ["start; condition; update", "condition; start; update", "update; condition; start", "start; update; condition"], a: 0 },
          { t: "mc", q: "What is the output?", code: "for (let i = 0; i < 3; i++) {\n  console.log(i);\n}",
            choices: ["0 1 2", "1 2 3", "0 1 2 3", "3"], a: 0 },
          { t: "fill", q: "Loop while i is less than 5", code: "for (let i = 0; i ___ 5; i++)",
            choices: ["<", ">", "==="], a: 0 },
          { t: "type", q: "How many times does this loop run? (type a number)", code: "for (let i = 0; i < 4; i++) {\n  console.log(\"hi\");\n}", a: "4" },
          { t: "mc", q: "What does i++ do?",
            choices: ["Adds 1 to i", "Doubles i", "Resets i to 0", "Deletes i"], a: 0 },
          { t: "order", q: "Build a for loop header counting 0, 1, 2",
            tokens: ["for", "(", "let i = 0", ";", "i < 3", ";", "i++", ")"] },
        ],
      },
      {
        title: "The while Loop",
        exercises: [
          { t: "mc", q: "A while loop keeps running as long as its condition is…",
            choices: ["true", "false", "a number", "short"], a: 0 },
          { t: "mc", q: "What is the output?", code: "let i = 0;\nwhile (i < 2) {\n  console.log(i);\n  i++;\n}",
            choices: ["0 1", "1 2", "0 1 2", "Nothing"], a: 0 },
          { t: "fill", q: "Keep looping while lives is greater than 0", code: "while (lives ___ 0)",
            choices: [">", "<", "==="], a: 0 },
          { t: "mc", q: "If you forget i++ inside a while loop, you get…",
            choices: ["An infinite loop", "A syntax error", "A faster loop", "Exactly one run"], a: 0 },
          { t: "type", q: "Type the output of this code", code: "let c = 3;\nwhile (c > 0) {\n  c--;\n}\nconsole.log(c);", a: "0" },
          { t: "mc", q: "Which loop always runs its body at least once?",
            choices: ["do...while", "while", "for", "if"], a: 0 },
        ],
      },
    ],
  },
  {
    title: "Unit 7 · Functions",
    desc: "Reusable blocks of code",
    color: "#7b61ff", colorDark: "#6248db", icon: "🛠️",
    lessons: [
      {
        title: "Your First Function",
        exercises: [
          { t: "mc", q: "Which keyword declares a function?",
            choices: ["function", "func", "def", "method"], a: 0 },
          { t: "order", q: "Build the code: declare an empty function called greet",
            tokens: ["function", "greet", "(", ")", "{", "}"] },
          { t: "mc", q: "How do you CALL the function greet?",
            choices: ["greet();", "call greet;", "greet.run", "function greet"], a: 0 },
          { t: "fill", q: "Fill in the keyword", code: '___ sayHi() {\n  console.log("Hi");\n}',
            choices: ["function", "method", "fun"], a: 0 },
          { t: "mc", q: "What is the output?", code: 'function wave() {\n  console.log("👋");\n}\nwave();\nwave();',
            choices: ["👋 👋", "👋", "wave wave", "Nothing"], a: 0 },
          { t: "type", q: "Type the output of this code", code: 'function boo() {\n  console.log("Boo!");\n}\nboo();', a: "Boo!" },
        ],
      },
      {
        title: "Parameters & Return",
        exercises: [
          { t: "mc", q: "Values you pass into a function are called…",
            choices: ["arguments", "ingredients", "imports", "options"], a: 0 },
          { t: "mc", q: "What does the return keyword do?",
            choices: ["Sends a value back and ends the function", "Prints a value", "Restarts the function", "Deletes the function"], a: 0 },
          { t: "type", q: "Type the output of this code", code: "function double(n) {\n  return n * 2;\n}\nconsole.log(double(5));", a: "10" },
          { t: "fill", q: "Send the sum back to the caller", code: "function add(a, b) {\n  ___ a + b;\n}",
            choices: ["return", "give", "console.log"], a: 0 },
          { t: "mc", q: "What is the output?", code: "function add(a, b) {\n  return a + b;\n}\nconsole.log(add(2, 3));",
            choices: ["5", "23", "a + b", "undefined"], a: 0 },
          { t: "order", q: "Build the code: return a times b",
            tokens: ["return", "a", "*", "b", ";"] },
        ],
      },
    ],
  },
  {
    title: "Unit 8 · Arrays",
    desc: "Lists of anything",
    color: "#f7567c", colorDark: "#d93f64", icon: "📚",
    lessons: [
      {
        title: "Lists of Things",
        exercises: [
          { t: "mc", q: "Which brackets create an array?",
            choices: ["[ ]", "{ }", "( )", "< >"], a: 0 },
          { t: "mc", q: "Array positions (indexes) start counting at…",
            choices: ["0", "1", "-1", "Wherever you like"], a: 0 },
          { t: "type", q: "Type the output of this code", code: 'let letters = ["a", "b", "c"];\nconsole.log(letters[1]);', a: "b" },
          { t: "fill", q: "How many items? Fill in the property", code: 'let colors = ["red", "blue"];\nconsole.log(colors.___);',
            choices: ["length", "size", "count"], a: 0 },
          { t: "mc", q: "What is the output?", code: "console.log([1, 2, 3].length);",
            choices: ["3", "2", "123", "[1, 2, 3]"], a: 0 },
          { t: "order", q: "Build the code: an array of the numbers 1, 2, 3 called nums",
            tokens: ["let", "nums", "=", "[", "1, 2, 3", "]", ";"] },
        ],
      },
      {
        title: "Array Methods",
        exercises: [
          { t: "mc", q: "Which method adds an item to the END of an array?",
            choices: ["push", "pop", "add", "append"], a: 0 },
          { t: "mc", q: "Which method removes the LAST item of an array?",
            choices: ["pop", "push", "shift", "cut"], a: 0 },
          { t: "type", q: "Type the output of this code", code: "let a = [1, 2];\na.push(3);\nconsole.log(a.length);", a: "3" },
          { t: "fill", q: "Add \"apple\" to the end of the list", code: 'fruits.___("apple");',
            choices: ["push", "pop", "plus"], a: 0 },
          { t: "mc", q: "After this code runs, what is nums?", code: "let nums = [1, 2, 3];\nnums.pop();",
            choices: ["[1, 2]", "[2, 3]", "[1, 2, 3]", "[]"], a: 0 },
          { t: "mc", q: "What does fruits.includes(\"kiwi\") tell you?",
            choices: ["Whether \"kiwi\" is in the array (true/false)", "Where \"kiwi\" is", "How many kiwis there are", "It adds a kiwi"], a: 0 },
        ],
      },
    ],
  },
];

/* ===================== State ===================== */
const STORAGE_KEY = "kodexa-v1";
const MAX_HEARTS = 5;
const XP_PER_CORRECT = 2;
const XP_LESSON_BONUS = 10;
const XP_PERFECT_BONUS = 5;

let state = loadState();

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && typeof raw === "object") {
      return { xp: 0, streak: 0, lastDay: null, completed: {}, ...raw };
    }
  } catch (e) { /* corrupted storage — start fresh */ }
  return { xp: 0, streak: 0, lastDay: null, completed: {}, };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function bumpStreak() {
  const today = todayStr();
  if (state.lastDay === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streak = state.lastDay === yesterday ? state.streak + 1 : 1;
  state.lastDay = today;
}

/* Linear unlocking: lesson n is unlocked once lessons 0..n-1 are complete. */
function lessonKey(u, l) { return `${u}-${l}`; }

function flatLessons() {
  const out = [];
  UNITS.forEach((unit, u) => unit.lessons.forEach((_, l) => out.push(lessonKey(u, l))));
  return out;
}

function firstIncompleteIndex() {
  const all = flatLessons();
  for (let i = 0; i < all.length; i++) if (!state.completed[all[i]]) return i;
  return all.length;
}

/* ===================== DOM helpers ===================== */
const $ = (id) => document.getElementById(id);
const homeScreen = $("homeScreen");
const lessonScreen = $("lessonScreen");
const resultScreen = $("resultScreen");

function show(screen) {
  [homeScreen, lessonScreen, resultScreen].forEach((s) => s.classList.add("hidden"));
  screen.classList.remove("hidden");
  window.scrollTo(0, 0);
}

function renderHeader() {
  $("statStreak").textContent = state.streak;
  $("statXp").textContent = state.xp;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ===================== Sounds ===================== */
let audioCtx = null;
function playTone(freqs, duration = 0.12) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t = audioCtx.currentTime + i * duration;
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + duration);
    });
  } catch (e) { /* sound is best-effort */ }
}
const dingGood = () => playTone([660, 880]);
const dingBad = () => playTone([220, 165], 0.18);

/* ===================== Home / path ===================== */
function renderHome() {
  renderHeader();
  const path = $("path");
  path.innerHTML = "";
  const currentIdx = firstIncompleteIndex();
  let flatIdx = 0;

  UNITS.forEach((unit, u) => {
    const unitDone = unit.lessons.every((_, l) => state.completed[lessonKey(u, l)]);
    const unitEl = document.createElement("section");
    unitEl.className = "unit" + (unitDone ? " done" : "");
    unitEl.innerHTML = `
      <div class="unit-banner" style="background:${unit.color}">
        <div>
          <h2>${escapeHtml(unit.title)}</h2>
          <p>${escapeHtml(unit.desc)}</p>
        </div>
        <div class="unit-crown" title="${unitDone ? "Unit complete!" : "Finish every lesson to earn the crown"}">👑</div>
      </div>
      <div class="unit-path"></div>`;
    const pathEl = unitEl.querySelector(".unit-path");

    unit.lessons.forEach((lesson, l) => {
      const key = lessonKey(u, l);
      const done = !!state.completed[key];
      const isCurrent = flatIdx === currentIdx;
      const locked = !done && !isCurrent;

      const wrap = document.createElement("div");
      wrap.className = "node-wrap";
      if (isCurrent) {
        const pill = document.createElement("div");
        pill.className = "start-pill";
        pill.textContent = "START";
        wrap.appendChild(pill);
      }
      const btn = document.createElement("button");
      btn.className = "node" + (done ? " done" : locked ? " locked" : " current");
      btn.style.setProperty("--unit-color", unit.color);
      btn.style.setProperty("--unit-color-dark", unit.colorDark);
      btn.disabled = locked;
      btn.textContent = done ? "✓" : locked ? "🔒" : unit.icon;
      btn.title = lesson.title;
      btn.addEventListener("click", () => startLesson(u, l));
      const label = document.createElement("div");
      label.className = "node-label";
      label.textContent = lesson.title;
      wrap.append(btn, label);
      pathEl.appendChild(wrap);
      flatIdx++;
    });

    path.appendChild(unitEl);
  });
}

/* ===================== Lesson engine ===================== */
let lesson = null; // active lesson session

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startLesson(u, l) {
  const data = UNITS[u].lessons[l];
  lesson = {
    u, l,
    queue: shuffle(data.exercises),
    total: data.exercises.length,
    correct: 0,
    mistakes: 0,
    hearts: MAX_HEARTS,
    checked: false,
    getAnswer: null, // set by each renderer; returns {ok, correctText}
  };
  show(lessonScreen);
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
  renderExercise(lesson.queue[0]);
}

function setCheckEnabled(on) {
  if (!lesson.checked) $("checkBtn").disabled = !on;
}

function renderExercise(ex) {
  const area = $("exerciseArea");
  area.innerHTML = "";

  const q = document.createElement("div");
  q.className = "exercise-q";
  q.textContent = ex.q;
  area.appendChild(q);

  if (ex.t === "mc") renderMC(area, ex);
  else if (ex.t === "fill") renderFill(area, ex);
  else if (ex.t === "order") renderOrder(area, ex);
  else if (ex.t === "type") renderType(area, ex);
}

function addCode(area, code) {
  if (!code) return null;
  const pre = document.createElement("div");
  pre.className = "code-block";
  pre.textContent = code;
  area.appendChild(pre);
  return pre;
}

/* --- multiple choice --- */
function renderMC(area, ex) {
  addCode(area, ex.code);
  const list = document.createElement("div");
  list.className = "choices";
  let selected = -1;
  const order = shuffle(ex.choices.map((_, i) => i));
  const buttons = order.map((origIdx) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.innerHTML = `<code>${escapeHtml(ex.choices[origIdx])}</code>`;
    b.addEventListener("click", () => {
      if (lesson.checked) return;
      selected = origIdx;
      buttons.forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      setCheckEnabled(true);
    });
    list.appendChild(b);
    return b;
  });
  area.appendChild(list);

  lesson.getAnswer = () => {
    const ok = selected === ex.a;
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (order[i] === ex.a) b.classList.add("correct");
      else if (order[i] === selected && !ok) b.classList.add("wrong");
    });
    return { ok, correctText: ex.choices[ex.a] };
  };
}

/* --- fill in the blank with chips --- */
function renderFill(area, ex) {
  const pre = addCode(area, "");
  const parts = ex.code.split("___");
  const blank = document.createElement("span");
  blank.className = "blank";
  blank.textContent = " ";
  pre.textContent = "";
  pre.append(document.createTextNode(parts[0]), blank, document.createTextNode(parts[1] ?? ""));

  const bank = document.createElement("div");
  bank.className = "chips";
  let selected = -1;
  const order = shuffle(ex.choices.map((_, i) => i));
  const chips = order.map((origIdx) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.textContent = ex.choices[origIdx];
    c.addEventListener("click", () => {
      if (lesson.checked) return;
      selected = selected === origIdx ? -1 : origIdx;
      chips.forEach((x) => x.classList.remove("selected"));
      if (selected !== -1) {
        c.classList.add("selected");
        blank.textContent = ex.choices[origIdx];
        blank.classList.add("filled");
      } else {
        blank.textContent = " ";
        blank.classList.remove("filled");
      }
      setCheckEnabled(selected !== -1);
    });
    bank.appendChild(c);
    return c;
  });
  area.appendChild(bank);

  lesson.getAnswer = () => ({ ok: selected === ex.a, correctText: ex.choices[ex.a] });
}

/* --- arrange tokens into code --- */
function renderOrder(area, ex) {
  const line = document.createElement("div");
  line.className = "order-line";
  area.appendChild(line);

  const bank = document.createElement("div");
  bank.className = "chips";
  area.appendChild(bank);

  const placed = []; // indexes into ex.tokens, in placed order
  const order = shuffle(ex.tokens.map((_, i) => i));

  function redrawLine() {
    line.innerHTML = "";
    placed.forEach((tokenIdx, pos) => {
      const c = document.createElement("button");
      c.className = "chip";
      c.textContent = ex.tokens[tokenIdx];
      c.addEventListener("click", () => {
        if (lesson.checked) return;
        placed.splice(pos, 1);
        bankChips[tokenIdx].classList.remove("used");
        redrawLine();
      });
      line.appendChild(c);
    });
    setCheckEnabled(placed.length === ex.tokens.length);
  }

  const bankChips = [];
  order.forEach((tokenIdx) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.textContent = ex.tokens[tokenIdx];
    c.addEventListener("click", () => {
      if (lesson.checked || c.classList.contains("used")) return;
      c.classList.add("used");
      placed.push(tokenIdx);
      redrawLine();
    });
    bankChips[tokenIdx] = c;
    bank.appendChild(c);
  });
  redrawLine();

  lesson.getAnswer = () => ({
    ok: placed.length === ex.tokens.length && placed.every((tokenIdx, pos) => ex.tokens[tokenIdx] === ex.tokens[pos]),
    correctText: ex.tokens.join(" "),
  });
}

/* --- type the answer --- */
function renderType(area, ex) {
  addCode(area, ex.code);
  const input = document.createElement("input");
  input.className = "type-input";
  input.placeholder = "Type your answer…";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.addEventListener("input", () => setCheckEnabled(input.value.trim() !== ""));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("checkBtn").disabled) $("checkBtn").click();
  });
  area.appendChild(input);
  setTimeout(() => input.focus(), 50);

  const normalize = (s) => s.trim().toLowerCase().replace(/^["']|["']$/g, "").replace(/;$/, "");
  lesson.getAnswer = () => {
    const accepted = [ex.a, ...(ex.alt || [])].map(normalize);
    return { ok: accepted.includes(normalize(input.value)), correctText: ex.a };
  };
}

/* --- check / continue flow --- */
$("checkBtn").addEventListener("click", () => {
  if (!lesson) return;

  if (lesson.checked) { // CONTINUE pressed
    nextExercise();
    return;
  }

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
    btn.className = "big-btn";
    dingGood();
  } else {
    lesson.mistakes++;
    lesson.hearts--;
    lesson.queue.push(ex); // Duolingo-style: missed questions come back
    fb.className = "feedback bad";
    $("feedbackTitle").textContent = "Not quite…";
    $("feedbackDetail").innerHTML = `Correct answer: <code>${escapeHtml(correctText)}</code>`;
    btn.className = "big-btn bad";
    dingBad();
  }
  renderLessonChrome();
});

$("quitBtn").addEventListener("click", () => {
  if (confirm("Quit this lesson? Your progress in it will be lost.")) {
    lesson = null;
    renderHome();
    show(homeScreen);
  }
});

/* ===================== Lesson end ===================== */
function endLesson(passed) {
  const card = $("resultCard");
  if (passed) {
    const perfect = lesson.mistakes === 0;
    let earned = XP_LESSON_BONUS + (perfect ? XP_PERFECT_BONUS : 0);
    const key = lessonKey(lesson.u, lesson.l);
    state.completed[key] = true;
    state.xp += earned;
    bumpStreak();
    saveState();
    // XP_PER_CORRECT was already added per answer; show the full lesson total
    earned += lesson.total * XP_PER_CORRECT;
    const accuracy = Math.round((lesson.total / (lesson.total + lesson.mistakes)) * 100);

    card.innerHTML = `
      <div class="result-emoji">${perfect ? "🏆" : "🎉"}</div>
      <h1>${perfect ? "Perfect lesson!" : "Lesson complete!"}</h1>
      <p>${escapeHtml(UNITS[lesson.u].lessons[lesson.l].title)} · ${escapeHtml(UNITS[lesson.u].title)}</p>
      <div class="result-stats">
        <div class="result-stat"><span class="label">TOTAL XP</span><span class="value">⚡ ${earned}</span></div>
        <div class="result-stat green"><span class="label">ACCURACY</span><span class="value">🎯 ${accuracy}%</span></div>
        <div class="result-stat blue"><span class="label">STREAK</span><span class="value">🔥 ${state.streak}</span></div>
      </div>
      <button class="big-btn" id="resultContinue">CONTINUE</button>`;
    confetti();
    playTone([523, 659, 784, 1047], 0.15);
  } else {
    card.innerHTML = `
      <div class="result-emoji">💔</div>
      <h1>Out of hearts!</h1>
      <p>No worries — mistakes are how you learn. Give it another go.</p>
      <button class="big-btn bad" id="resultRetry">TRY AGAIN</button>
      <button class="big-btn blue" id="resultContinue">BACK TO LESSONS</button>`;
  }

  const { u, l } = lesson;
  lesson = null;
  show(resultScreen);
  renderHeader();
  const retry = $("resultRetry");
  if (retry) retry.addEventListener("click", () => startLesson(u, l));
  $("resultContinue").addEventListener("click", () => {
    renderHome();
    show(homeScreen);
  });
}

function confetti() {
  const colors = ["#58cc02", "#1cb0f6", "#ce82ff", "#ff9600", "#ff4b4b", "#ffc800"];
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

/* ===================== Reset ===================== */
$("resetBtn").addEventListener("click", () => {
  if (confirm("Reset ALL progress (XP, streak and completed lessons)?")) {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    renderHome();
  }
});

/* ===================== Boot ===================== */
renderHome();
