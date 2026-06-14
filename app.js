/* CodeDeck — a multi-language code editor & runner that lives entirely in the
 * browser. JavaScript runs natively; every other language is compiled/run via
 * the free public Piston API (https://github.com/engineer-man/piston). There is
 * no backend and no API key — your code is sent directly to the Piston endpoint
 * when you press Run.
 */

const PISTON = "https://emkc.org/api/v2/piston";

/* Each language maps to:
 *  - monaco:   the Monaco editor language id (for highlighting)
 *  - piston:   candidate Piston language names/aliases (first match wins)
 *  - file:     the filename Piston should compile/run
 * The editor always starts empty — there are no starter snippets.
 * JavaScript is special-cased to run natively in the browser (piston: null).
 */
const LANGUAGES = [
  { id: "python",     label: "Python",               monaco: "python",     piston: ["python", "python3"],            file: "main.py" },
  { id: "javascript", label: "JavaScript",           monaco: "javascript", piston: null,                             file: "main.js" },
  { id: "web",        label: "Web (HTML + CSS + JS)", monaco: "html",       piston: null,                             file: "web" },
  { id: "html",       label: "HTML (live preview)",  monaco: "html",       piston: null,                             file: "index.html" },
  { id: "typescript", label: "TypeScript",           monaco: "typescript", piston: ["typescript", "ts"],             file: "main.ts" },
  { id: "cpp",        label: "C++",                  monaco: "cpp",        piston: ["c++", "cpp"],                   file: "main.cpp" },
  { id: "c",          label: "C",                    monaco: "c",          piston: ["c"],                            file: "main.c" },
  { id: "csharp",     label: "C#",                   monaco: "csharp",     piston: ["csharp", "c#", "csharp.net", "mono"], file: "main.cs" },
  { id: "java",       label: "Java",                 monaco: "java",       piston: ["java"],                         file: "Main.java" },
  { id: "go",         label: "Go",                   monaco: "go",         piston: ["go", "golang"],                 file: "main.go" },
  { id: "rust",       label: "Rust",                 monaco: "rust",       piston: ["rust"],                         file: "main.rs" },
  { id: "ruby",       label: "Ruby",                 monaco: "ruby",       piston: ["ruby"],                         file: "main.rb" },
  { id: "php",        label: "PHP",                  monaco: "php",        piston: ["php"],                          file: "main.php" },
  { id: "kotlin",     label: "Kotlin",               monaco: "kotlin",     piston: ["kotlin"],                       file: "main.kt" },
  { id: "swift",      label: "Swift",                monaco: "swift",      piston: ["swift"],                        file: "main.swift" },
  { id: "bash",       label: "Bash",                 monaco: "shell",      piston: ["bash", "sh"],                   file: "main.sh" },
];

// ----- DOM refs -----
const $ = (id) => document.getElementById(id);
const languageSelect = $("languageSelect");
const runBtn = $("runBtn");
const stdinEl = $("stdin");
const outputEl = $("output");
const statusBar = $("statusBar");
const runtimeBadge = $("runtimeBadge");
const fileNameEl = $("fileName");

let editor = null;          // Monaco editor instance
let runtimes = [];          // resolved Piston runtimes
let currentLang = LANGUAGES[0];
const codeCache = {};        // remember per-language edits during the session

// "Web" mode keeps three separate buffers combined into one live preview.
let currentWebPart = "html";
const webFiles = { html: "", css: "", js: "" };

let pyodideReady = null;     // lazy-loaded Pyodide (in-browser Python) promise
let pyodideLoaded = false;   // true once Pyodide has finished downloading
let rubyReady = null, rubyLoaded = false;   // ruby.wasm
let phpReady = null, phpLoaded = false;     // php-wasm

// ----- Output helpers -----
function clearOutput() {
  outputEl.innerHTML = '<span class="output-placeholder">Output cleared. Hit Run ▶</span>';
}
function writeOutput(parts) {
  outputEl.innerHTML = "";
  for (const [cls, text] of parts) {
    if (text == null || text === "") continue;
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    outputEl.appendChild(span);
  }
  outputEl.scrollTop = 0;
}
function setStatus(msg) { statusBar.textContent = msg; }

// HTML: render the code as a live preview inside a sandboxed iframe.
function renderHtml(code) {
  const iframe = $("preview");
  iframe.srcdoc = code;
  setStatus("Live preview updated.");
}

// Web mode: combine the three buffers into one document and preview it.
function renderWeb() {
  if (editor) webFiles[currentWebPart] = editor.getValue();
  const doc =
`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
${webFiles.css}
</style>
</head>
<body>
${webFiles.html}
<script>
${webFiles.js}
<\/script>
</body>
</html>`;
  $("preview").srcdoc = doc;
  setStatus("Live preview updated.");
}

function setActiveWebTab() {
  document.querySelectorAll(".web-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.part === currentWebPart));
}

// Switch between the HTML / CSS / JS tabs without leaving Web mode.
function switchWebPart(part) {
  if (!editor || part === currentWebPart) return;
  webFiles[currentWebPart] = editor.getValue();
  currentWebPart = part;
  setActiveWebTab();
  const lang = part === "js" ? "javascript" : part; // html | css | javascript
  monaco.editor.setModelLanguage(editor.getModel(), lang);
  editor.setValue(webFiles[part]);
  renderWeb();
}

// Swap the IO pane between text output and the live preview (HTML / Web modes).
function updateIoMode() {
  const isPreview = currentLang.id === "html" || currentLang.id === "web";
  $("preview").classList.toggle("hidden", !isPreview);
  $("output").classList.toggle("hidden", isPreview);
  $("stdinBlock").classList.toggle("hidden", isPreview);
  $("webTabs").classList.toggle("hidden", currentLang.id !== "web");
  $("fileName").classList.toggle("hidden", currentLang.id === "web");
  $("turtleCanvas").classList.add("hidden");  // only shown during a turtle run
  $("outputLabel").textContent = isPreview ? "Preview" : "Output";
  if (currentLang.id === "html" && editor) renderHtml(editor.getValue());
  if (currentLang.id === "web" && editor) renderWeb();
}

// ----- Language selection & editor wiring -----
function buildLanguageOptions() {
  languageSelect.innerHTML = "";
  for (const lang of LANGUAGES) {
    const opt = document.createElement("option");
    opt.value = lang.id;
    opt.textContent = lang.label;
    languageSelect.appendChild(opt);
  }
}

function pistonRuntimeFor(lang) {
  if (!lang.piston) return null;
  for (const alias of lang.piston) {
    const rt = runtimes.find(
      (r) => r.language === alias || (r.aliases || []).includes(alias)
    );
    if (rt) return rt;
  }
  return null;
}

function updateRuntimeBadge() {
  if (currentLang.id === "html") {
    runtimeBadge.textContent = "HTML · live preview";
    return;
  }
  if (currentLang.id === "web") {
    runtimeBadge.textContent = "Web · live preview";
    return;
  }
  if (currentLang.id === "javascript") {
    runtimeBadge.textContent = "browser engine";
    return;
  }
  if (currentLang.id === "python") {
    runtimeBadge.textContent = pyodideLoaded ? "Python · in-browser" : "Python · in-browser (loads on first run)";
    return;
  }
  if (currentLang.id === "typescript") {
    runtimeBadge.textContent = tsReady ? "TypeScript · in-browser" : "TypeScript · in-browser (loads on first run)";
    return;
  }
  if (currentLang.id === "ruby") {
    runtimeBadge.textContent = rubyLoaded ? "Ruby · in-browser" : "Ruby · in-browser (loads on first run)";
    return;
  }
  if (currentLang.id === "php") {
    runtimeBadge.textContent = phpLoaded ? "PHP · in-browser" : "PHP · in-browser (loads on first run)";
    return;
  }
  if (!runtimes.length) {
    runtimeBadge.textContent = "loading runtimes…";
    return;
  }
  const rt = pistonRuntimeFor(currentLang);
  runtimeBadge.textContent = rt ? `${rt.language} ${rt.version}` : "runtime unavailable";
}

function selectLanguage(id) {
  // stash the code we're leaving
  if (editor && currentLang) {
    if (currentLang.id === "web") webFiles[currentWebPart] = editor.getValue();
    else codeCache[currentLang.id] = editor.getValue();
  }

  currentLang = LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];
  languageSelect.value = currentLang.id;
  fileNameEl.textContent = currentLang.file;

  if (editor) {
    if (currentLang.id === "web") {
      currentWebPart = "html";
      setActiveWebTab();
      monaco.editor.setModelLanguage(editor.getModel(), "html");
      editor.setValue(webFiles.html);
    } else {
      const cached = codeCache[currentLang.id];
      monaco.editor.setModelLanguage(editor.getModel(), currentLang.monaco);
      editor.setValue(cached != null ? cached : "");
    }
  }
  updateRuntimeBadge();
  updateIoMode();
}

// ----- Running code -----
async function runCode() {
  const code = editor ? editor.getValue() : "";
  const stdin = stdinEl.value;

  // Preview modes are instant and may have empty buffers — handle up front.
  if (currentLang.id === "web") { renderWeb(); return; }
  if (currentLang.id === "html") { renderHtml(code); return; }

  if (!code.trim()) {
    writeOutput([["out-meta", "Nothing to run — the editor is empty."]]);
    return;
  }

  runBtn.disabled = true;
  const t0 = performance.now();

  try {
    if (currentLang.id === "javascript") {
      runJavaScript(code);
    } else if (currentLang.id === "typescript") {
      await runTypeScript(code);
    } else if (currentLang.id === "python") {
      await runPython(code, stdin, t0);
    } else if (currentLang.id === "ruby") {
      await runRuby(code, stdin, t0);
    } else if (currentLang.id === "php") {
      await runPhp(code, stdin, t0);
    } else {
      await runViaPiston(code, stdin, t0);
    }
  } catch (err) {
    writeOutput([["out-stderr", "Error: " + (err && err.message ? err.message : String(err))]]);
    setStatus("Run failed.");
  } finally {
    runBtn.disabled = false;
  }
}

// JavaScript: capture console output and run in the page (sandboxed-ish via Function).
function runJavaScript(code, label = "JavaScript") {
  setStatus(`Running ${label} in your browser…`);
  const logs = [];
  const fmt = (args) => args.map((a) => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a, null, 2); } catch { return String(a); }
  }).join(" ");

  const sandboxConsole = {
    log: (...a) => logs.push(["out-stdout", fmt(a) + "\n"]),
    info: (...a) => logs.push(["out-info", fmt(a) + "\n"]),
    warn: (...a) => logs.push(["out-meta", fmt(a) + "\n"]),
    error: (...a) => logs.push(["out-stderr", fmt(a) + "\n"]),
  };

  const t0 = performance.now();
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("console", `"use strict";\n${code}`);
    const result = fn(sandboxConsole);
    if (result !== undefined) logs.push(["out-meta", "⇒ " + fmt([result]) + "\n"]);
  } catch (err) {
    logs.push(["out-stderr", (err && err.stack ? err.stack : String(err)) + "\n"]);
  }
  const ms = Math.round(performance.now() - t0);
  if (!logs.length) logs.push(["out-meta", "(no output)\n"]);
  logs.push(["out-ok", `\n✓ finished in ${ms} ms (${label} · browser, no limits)`]);
  writeOutput(logs);
  setStatus("Done.");
}

// TypeScript: load the TS compiler once, transpile to JS, then run it locally.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

let tsReady = null;
function getTypeScript() {
  if (!tsReady) {
    setStatus("Loading the TypeScript compiler once… future runs are instant.");
    writeOutput([["out-meta", "⏳ First TypeScript run: downloading the compiler once…"]]);
    runtimeBadge.textContent = "TypeScript · loading…";
    tsReady = loadScript("https://cdn.jsdelivr.net/npm/typescript@5.4.5/lib/typescript.js")
      .then(() => { runtimeBadge.textContent = "TypeScript · in-browser"; return window.ts; })
      .catch((err) => { tsReady = null; throw err; });
  }
  return tsReady;
}

async function runTypeScript(code) {
  const ts = await getTypeScript();
  let js;
  try {
    js = ts.transpile(code, {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
    });
  } catch (err) {
    writeOutput([["out-stderr", "TypeScript compile error: " + (err && err.message ? err.message : String(err))]]);
    setStatus("Compile failed.");
    return;
  }
  runJavaScript(js, "TypeScript");
}

// Python runs locally in the browser via Pyodide (WebAssembly CPython).
// The runtime is downloaded once on the first run, then every run is instant
// and unlimited — no network round-trip and no rate limits.
function getPyodide() {
  if (!pyodideReady) {
    pyodideReady = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" })
      .then((py) => { pyodideLoaded = true; if (currentLang.id === "python") updateRuntimeBadge(); return py; })
      .catch((err) => { pyodideReady = null; throw err; });
  }
  return pyodideReady;
}

// A browser turtle for Python. The real module needs Tk, so we ship our own
// that RECORDS every move while the (synchronous) Python runs; afterwards
// JavaScript animates the recording so you watch the turtle move, like an IDE.
const TURTLE_PY = String.raw`
import math, json

_events = []
_turtles = []
_next_id = [0]

def _ev(d): _events.append(d)

def _rgb(r, g, b):
    vals = [r, g, b]
    if all(isinstance(v, (int, float)) for v in vals) and max(vals) <= 1.0:
        r, g, b = [int(round(v * 255)) for v in vals]
    return "rgb(%d,%d,%d)" % (int(r), int(g), int(b))

def _col(c):
    if len(c) == 1:
        v = c[0]
        if isinstance(v, (tuple, list)):
            return _rgb(v[0], v[1], v[2])
        return str(v)
    if len(c) >= 3:
        return _rgb(c[0], c[1], c[2])
    return str(c[0])

class Turtle:
    def __init__(self, *a, **k):
        self._id = _next_id[0]; _next_id[0] += 1
        _turtles.append(self)
        self.reset()
    def reset(self):
        self.x = 0.0; self.y = 0.0; self._heading = 0.0
        self._down = True; self._pc = "black"; self._fc = "black"; self._w = 1
        self._fill = False; self._fpts = []; self._vis = True; self._spd = 6
    def speed(self, s=None):
        names = {"fastest": 0, "fast": 10, "normal": 6, "slow": 3, "slowest": 1}
        if s is None: return self._spd
        if isinstance(s, str): s = names.get(s, 6)
        self._spd = max(0, min(10, int(s)))
    def _moveto(self, nx, ny):
        op = "line" if self._down else "move"
        _ev({"op": op, "id": self._id, "x1": self.x, "y1": self.y, "x2": nx, "y2": ny,
             "h": self._heading, "color": self._pc, "width": self._w,
             "speed": self._spd, "visible": self._vis})
        if self._fill: self._fpts.append([nx, ny])
        self.x = nx; self.y = ny
    def forward(self, d):
        a = math.radians(self._heading)
        self._moveto(self.x + d * math.cos(a), self.y + d * math.sin(a))
    fd = forward
    def backward(self, d): self.forward(-d)
    back = backward; bk = backward
    def _turn(self, da):
        _ev({"op": "turn", "id": self._id, "x": self.x, "y": self.y,
             "h1": self._heading, "da": da, "color": self._pc,
             "speed": self._spd, "visible": self._vis})
        self._heading = (self._heading + da) % 360
    def left(self, a): self._turn(a)
    lt = left
    def right(self, a): self._turn(-a)
    rt = right
    def setheading(self, t):
        da = ((t - self._heading + 180) % 360) - 180
        self._turn(da)
    seth = setheading
    def goto(self, x, y=None):
        if y is None: x, y = x
        self._moveto(float(x), float(y))
    setpos = goto; setposition = goto
    def setx(self, x): self._moveto(float(x), self.y)
    def sety(self, y): self._moveto(self.x, float(y))
    def home(self): self._moveto(0, 0); self.setheading(0)
    def penup(self): self._down = False
    pu = penup; up = penup
    def pendown(self): self._down = True
    pd = pendown; down = pendown
    def isdown(self): return self._down
    def pensize(self, w=None):
        if w is None: return self._w
        self._w = w
    width = pensize
    def pencolor(self, *c):
        if not c: return self._pc
        self._pc = _col(c)
    def fillcolor(self, *c):
        if not c: return self._fc
        self._fc = _col(c)
    def color(self, *c):
        if not c: return (self._pc, self._fc)
        if len(c) == 1: self._pc = self._fc = _col(c)
        else: self._pc = _col((c[0],)); self._fc = _col((c[1],))
    def begin_fill(self): self._fill = True; self._fpts = [[self.x, self.y]]
    def end_fill(self):
        if self._fill and len(self._fpts) > 1:
            _ev({"op": "fill", "points": self._fpts, "color": self._fc})
        self._fill = False; self._fpts = []
    def circle(self, radius, extent=360, steps=None):
        frac = abs(extent) / 360.0
        if steps is None: steps = 1 + int(min(11 + abs(radius) / 6.0, 59.0) * frac)
        w = extent / steps; w2 = 0.5 * w
        length = 2.0 * radius * math.sin(math.radians(w2))
        if radius < 0: length, w, w2 = -length, -w, -w2
        self.left(w2)
        for _ in range(int(steps)): self.forward(length); self.left(w)
        self.left(-w2)
    def dot(self, size=None, *color):
        s = size or max(self._w + 4, 2 * self._w)
        col = _col(color) if color else self._pc
        _ev({"op": "dot", "x": self.x, "y": self.y, "r": s, "color": col})
    def stamp(self):
        _ev({"op": "stamp", "x": self.x, "y": self.y, "h": self._heading, "color": self._pc})
    def write(self, text, move=False, align="left", font=("Arial", 8, "normal")):
        size = font[1] if len(font) > 1 else 8
        fam = font[0] if font else "Arial"
        _ev({"op": "write", "x": self.x, "y": self.y, "text": str(text),
             "color": self._pc, "size": int(size), "font": fam})
    def clear(self): _ev({"op": "clear"})
    def pos(self): return (self.x, self.y)
    position = pos
    def xcor(self): return self.x
    def ycor(self): return self.y
    def heading(self): return self._heading % 360
    def towards(self, x, y=None):
        if y is None: x, y = x
        return math.degrees(math.atan2(y - self.y, x - self.x)) % 360
    def distance(self, x, y=None):
        if y is None: x, y = x
        return math.hypot(x - self.x, y - self.y)
    def showturtle(self): self._vis = True
    st = showturtle
    def hideturtle(self): self._vis = False
    ht = hideturtle
    def isvisible(self): return self._vis

Pen = Turtle
RawTurtle = Turtle

class _Screen:
    def reset(self): pass
    def bgcolor(self, *c):
        if not c: return getattr(self, "_bg", "white")
        self._bg = _col(c); _ev({"op": "bgcolor", "color": self._bg})
    def setup(self, *a, **k): pass
    def setworldcoordinates(self, *a): pass
    def title(self, *a): pass
    def tracer(self, n=None, *a, **k):
        on = True if (n is None or n) else False
        _ev({"op": "tracer", "on": bool(on)})
    def update(self): pass
    def delay(self, *a): pass
    def colormode(self, *a): pass
    def bgpic(self, *a): pass
    def bye(self): pass
    def exitonclick(self): pass
    def mainloop(self): pass
    def listen(self, *a, **k): pass
    def onkey(self, *a, **k): pass
    def onkeypress(self, *a, **k): pass
    def onclick(self, *a, **k): pass
    def window_width(self): return 600
    def window_height(self): return 400

_screen = _Screen()
_pen = Turtle()

def Screen(): return _screen
def getscreen(): return _screen

def _setup():
    _events.clear()
    del _turtles[:]
    _turtles.append(_pen)
    _next_id[0] = _pen._id + 1
    _pen.reset()

def _dump():
    return json.dumps(_events)

for _n in ["forward","fd","backward","back","bk","right","rt","left","lt",
           "goto","setpos","setposition","setx","sety","setheading","seth",
           "home","penup","pu","up","pendown","pd","down","isdown","pensize",
           "width","pencolor","fillcolor","color","begin_fill","end_fill",
           "circle","dot","stamp","write","clear","pos","position","xcor",
           "ycor","heading","towards","distance","speed","showturtle","st",
           "hideturtle","ht","isvisible"]:
    globals()[_n] = getattr(_pen, _n)

bgcolor = _screen.bgcolor
tracer = _screen.tracer
colormode = _screen.colormode
def update(): pass
def title(*a): pass
def setup(*a, **k): pass
def done(): pass
mainloop = done
def exitonclick(): pass
def bye(): pass
def listen(*a, **k): pass
def onkey(*a, **k): pass
def onclick(*a, **k): pass
`;

let turtleInstalled = false;
function installTurtle(py) {
  if (turtleInstalled) return;
  py.globals.set("__TURTLE_SRC__", TURTLE_PY);
  py.runPython([
    "import sys, types",
    "if 'turtle' not in sys.modules:",
    "    _m = types.ModuleType('turtle')",
    "    exec(__TURTLE_SRC__, _m.__dict__)",
    "    sys.modules['turtle'] = _m",
    "del __TURTLE_SRC__",
  ].join("\n"));
  turtleInstalled = true;
}

function prepareTurtleCanvas() {
  const cv = $("turtleCanvas");
  cv.width = cv.clientWidth || 600;
  cv.height = cv.clientHeight || 400;
}

// Replay recorded turtle events with animation onto the canvas.
const TURTLE_INSTANT_LIMIT = 4000; // huge drawings render instantly to stay snappy
let turtleAnim = null;
function animateTurtle(events) {
  if (turtleAnim) cancelAnimationFrame(turtleAnim);
  return new Promise((resolve) => {
    const cv = $("turtleCanvas");
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext("2d");
    const buf = document.createElement("canvas");
    buf.width = W; buf.height = H;
    const b = buf.getContext("2d");
    b.lineCap = "round"; b.lineJoin = "round";

    const cx = (x) => W / 2 + x;
    const cy = (y) => H / 2 - y;
    const states = {};
    let idx = 0;
    let instant = events.length > TURTLE_INSTANT_LIMIT;

    const stOf = (id) => {
      if (states[id] == null) states[id] = { x: 0, y: 0, h: 0, color: "#222", visible: true };
      return states[id];
    };
    const setState = (e, x, y, h) => {
      const s = stOf(e.id);
      s.x = x; s.y = y; s.h = h;
      if (e.color) s.color = e.color;
      if (e.visible !== undefined) s.visible = e.visible;
    };
    const pxPerFrame = (sp) => (instant || !sp ? Infinity : sp * 2 + 2);
    const degPerFrame = (sp) => (instant || !sp ? Infinity : sp * 6 + 6);

    function blit() { ctx.clearRect(0, 0, W, H); ctx.drawImage(buf, 0, 0); }
    function commitLine(e) {
      b.beginPath(); b.strokeStyle = e.color; b.lineWidth = e.width;
      b.moveTo(cx(e.x1), cy(e.y1)); b.lineTo(cx(e.x2), cy(e.y2)); b.stroke();
    }
    function cursor(c, x, y, h, color) {
      c.save(); c.translate(cx(x), cy(y)); c.rotate(-h * Math.PI / 180);
      c.beginPath(); c.moveTo(12, 0); c.lineTo(-9, 8); c.lineTo(-4, 0); c.lineTo(-9, -8);
      c.closePath(); c.fillStyle = color || "#222"; c.fill();
      c.lineWidth = 1; c.strokeStyle = "rgba(0,0,0,.55)"; c.stroke(); c.restore();
    }
    function otherCursors(exceptId) {
      for (const id in states) {
        if (id !== String(exceptId) && states[id].visible) {
          const o = states[id]; cursor(ctx, o.x, o.y, o.h, o.color);
        }
      }
    }
    function applyInstant(e) {
      if (e.op === "tracer") { instant = !e.on; return; }
      if (e.op === "clear") { b.clearRect(0, 0, W, H); return; }
      if (e.op === "bgcolor") {
        b.save(); b.globalCompositeOperation = "destination-over";
        b.fillStyle = e.color; b.fillRect(0, 0, W, H); b.restore(); return;
      }
      if (e.op === "fill" && e.points && e.points.length > 1) {
        b.save(); b.globalCompositeOperation = "destination-over";
        b.beginPath(); b.fillStyle = e.color;
        b.moveTo(cx(e.points[0][0]), cy(e.points[0][1]));
        for (let i = 1; i < e.points.length; i++) b.lineTo(cx(e.points[i][0]), cy(e.points[i][1]));
        b.closePath(); b.fill(); b.restore(); return;
      }
      if (e.op === "dot") {
        b.beginPath(); b.fillStyle = e.color;
        b.arc(cx(e.x), cy(e.y), e.r / 2, 0, 2 * Math.PI); b.fill(); return;
      }
      if (e.op === "write") {
        b.fillStyle = e.color; b.font = e.size + "px " + e.font;
        b.fillText(e.text, cx(e.x), cy(e.y)); return;
      }
      if (e.op === "stamp") { cursor(b, e.x, e.y, e.h, e.color); return; }
    }
    function finish() {
      blit();
      for (const id in states) {
        const s = states[id]; if (s.visible) cursor(ctx, s.x, s.y, s.h, s.color);
      }
      turtleAnim = null; resolve();
    }

    function animateMove(e) {
      const dist = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      const pxf = pxPerFrame(e.speed);
      let trav = 0;
      (function step() {
        trav += pxf;
        const t = Math.min(1, trav / dist);
        const x = e.x1 + (e.x2 - e.x1) * t, y = e.y1 + (e.y2 - e.y1) * t;
        blit();
        if (e.op === "line") {
          ctx.beginPath(); ctx.strokeStyle = e.color; ctx.lineWidth = e.width;
          ctx.lineCap = "round"; ctx.moveTo(cx(e.x1), cy(e.y1));
          ctx.lineTo(cx(x), cy(y)); ctx.stroke();
        }
        otherCursors(e.id);
        if (e.visible) cursor(ctx, x, y, e.h, e.color);
        if (t >= 1) { if (e.op === "line") commitLine(e); setState(e, e.x2, e.y2, e.h); pump(); }
        else turtleAnim = requestAnimationFrame(step);
      })();
    }
    function animateTurn(e) {
      const degf = degPerFrame(e.speed);
      const total = Math.abs(e.da);
      let done = 0;
      (function step() {
        done += degf;
        const t = Math.min(1, done / total);
        const h = e.h1 + e.da * t;
        blit();
        otherCursors(e.id);
        if (e.visible) cursor(ctx, e.x, e.y, h, e.color);
        if (t >= 1) { setState(e, e.x, e.y, e.h1 + e.da); pump(); }
        else turtleAnim = requestAnimationFrame(step);
      })();
    }
    function pump() {
      while (idx < events.length) {
        const e = events[idx];
        if (e.op === "line" || e.op === "move") {
          const dist = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
          if (!instant && e.speed && dist > 0) { idx++; animateMove(e); return; }
          if (e.op === "line") commitLine(e);
          setState(e, e.x2, e.y2, e.h); idx++; continue;
        }
        if (e.op === "turn") {
          if (!instant && e.speed && e.da) { idx++; animateTurn(e); return; }
          setState(e, e.x, e.y, e.h1 + e.da); idx++; continue;
        }
        applyInstant(e); idx++;
      }
      finish();
    }
    pump();
  });
}

async function runPython(code, stdin, t0) {
  const py = await getPyodide();
  const startedAt = performance.now();
  const out = [];
  const usesTurtle = /\bturtle\b/.test(code);

  // Show the drawing canvas for turtle programs, plain text otherwise.
  $("preview").classList.add("hidden");
  $("turtleCanvas").classList.toggle("hidden", !usesTurtle);
  $("output").classList.toggle("hidden", usesTurtle);
  $("outputLabel").textContent = usesTurtle ? "Turtle drawing" : "Output";

  py.setStdout({ batched: (s) => out.push(["out-stdout", s + "\n"]) });
  py.setStderr({ batched: (s) => out.push(["out-stderr", s + "\n"]) });

  let stdinSent = false;
  py.setStdin({
    stdin: () => { if (stdinSent) return null; stdinSent = true; return stdin || ""; },
  });

  if (usesTurtle) {
    installTurtle(py);
    prepareTurtleCanvas();
    py.runPython("import turtle as __t; __t._setup()");
    setStatus("Drawing…");
  } else {
    writeOutput([["out-meta", "Running…"]]);
  }

  let runError = null;
  try {
    await py.runPythonAsync(code);
  } catch (err) {
    runError = err && err.message ? err.message : String(err);
  }

  if (usesTurtle) {
    let events = [];
    try { events = JSON.parse(py.runPython("import turtle as __t; __t._dump()")); } catch {}
    await animateTurtle(events);
    const ms = Math.round(performance.now() - startedAt);
    const hasText = out.some((p) => p[0] === "out-stdout" || p[0] === "out-stderr");
    if (runError) out.push(["out-stderr", "\n" + runError]);
    if (runError || hasText) { $("output").classList.remove("hidden"); writeOutput(out); }
    setStatus(runError ? "Python raised an error." : `Done — turtle drawing rendered (${ms} ms).`);
    return;
  }

  const ms = Math.round(performance.now() - startedAt);
  if (runError) {
    out.push(["out-stderr", "\n" + runError]);
    $("output").classList.remove("hidden");
    writeOutput(out);
    setStatus("Python raised an error.");
    return;
  }
  if (!out.length) out.push(["out-meta", "(no output)\n"]);
  out.push(["out-ok", `\n✓ finished in ${ms} ms (in-browser Python, no limits)`]);
  writeOutput(out);
  setStatus("Done.");
}

// Ruby runs locally via ruby.wasm (official CRuby compiled to WebAssembly).
function getRuby() {
  if (!rubyReady) {
    rubyReady = (async () => {
      const { DefaultRubyVM } = await import("https://cdn.jsdelivr.net/npm/@ruby/wasm-wasi@2.6.2/dist/browser/+esm");
      const resp = await fetch("https://cdn.jsdelivr.net/npm/@ruby/3.3-wasm-wasi@2.6.2/dist/ruby+stdlib.wasm");
      const mod = await WebAssembly.compile(await resp.arrayBuffer());
      const { vm } = await DefaultRubyVM(mod);
      rubyLoaded = true;
      if (currentLang.id === "ruby") updateRuntimeBadge();
      return vm;
    })().catch((err) => { rubyReady = null; throw err; });
  }
  return rubyReady;
}

// Build a single-quoted Ruby string literal (no interpolation, safe for stdin).
function rubyStr(s) {
  return "'" + String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

async function runRuby(code, stdin, t0) {
  let vm;
  try { vm = await getRuby(); }
  catch { return fallbackToPiston(code, stdin, t0, "Ruby"); }

  const started = performance.now();
  // Redirect Ruby's $stdout/$stderr into a buffer and feed stdin from a StringIO,
  // so we capture output as a return value instead of via WASI plumbing.
  const wrapped =
`require 'stringio'
$stdin = StringIO.new(${rubyStr(stdin)})
__buf = StringIO.new
$stdout = __buf
$stderr = __buf
__err = nil
begin
${code}
rescue Exception => e
  __err = "#{e.class}: #{e.message}"
end
$stdout = STDOUT
$stderr = STDERR
__buf.string + (__err ? (__buf.string.empty? ? '' : "\\n") + __err : '')`;

  let text;
  try { text = vm.eval(wrapped).toString(); }
  catch { return fallbackToPiston(code, stdin, t0, "Ruby"); }

  const ms = Math.round(performance.now() - started);
  const parts = [];
  if (text) parts.push(["out-stdout", text.endsWith("\n") ? text : text + "\n"]);
  else parts.push(["out-meta", "(no output)\n"]);
  parts.push(["out-ok", `\n✓ finished in ${ms} ms (in-browser Ruby, no limits)`]);
  writeOutput(parts);
  setStatus("Done.");
}

// PHP runs locally via php-wasm.
function getPhp() {
  if (!phpReady) {
    phpReady = (async () => {
      const { PhpWeb } = await import("https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs");
      const php = new PhpWeb();
      await php.binary;            // resolves once the wasm runtime is ready
      phpLoaded = true;
      if (currentLang.id === "php") updateRuntimeBadge();
      return php;
    })().catch((err) => { phpReady = null; throw err; });
  }
  return phpReady;
}

async function runPhp(code, stdin, t0) {
  // Local php-wasm stdin support is unreliable; route those runs to Piston.
  if (stdin && stdin.trim()) return fallbackToPiston(code, stdin, t0, "PHP");
  let php;
  try { php = await getPhp(); }
  catch { return fallbackToPiston(code, stdin, t0, "PHP"); }

  const started = performance.now();
  let out = "";
  const collect = (ev) => { const d = ev.detail; out += Array.isArray(d) ? d.join("") : (d ?? ""); };
  php.addEventListener("output", collect);
  php.addEventListener("error", collect);

  let exit = 0;
  try {
    exit = await php.run(/<\?/.test(code) ? code : "<?php\n" + code);
  } catch {
    php.removeEventListener("output", collect);
    php.removeEventListener("error", collect);
    return fallbackToPiston(code, stdin, t0, "PHP");
  }
  php.removeEventListener("output", collect);
  php.removeEventListener("error", collect);

  const ms = Math.round(performance.now() - started);
  const parts = [];
  if (out) parts.push(["out-stdout", out.endsWith("\n") ? out : out + "\n"]);
  else parts.push(["out-meta", "(no output)\n"]);
  parts.push(["out-ok", `\n✓ exit code ${exit} · in-browser PHP, no limits · ${ms} ms`]);
  writeOutput(parts);
  setStatus("Done.");
}

// Shared graceful fallback: if a local WASM runtime can't load/run, use Piston.
async function fallbackToPiston(code, stdin, t0, label) {
  writeOutput([["out-meta", `${label}: in-browser runtime unavailable — running on the Piston server instead…`]]);
  await runViaPiston(code, stdin, t0);
}

async function runViaPiston(code, stdin, t0) {
  const rt = pistonRuntimeFor(currentLang);
  if (!rt) {
    writeOutput([["out-stderr",
      `No runtime available for ${currentLang.label}. The Piston service may not support it right now.`]]);
    setStatus("Runtime unavailable.");
    return;
  }

  setStatus("Running…");
  writeOutput([["out-meta", "Running…"]]);

  const res = await fetch(`${PISTON}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: rt.language,
      version: rt.version,
      files: [{ name: currentLang.file, content: code }],
      stdin: stdin || "",
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j.message) detail += ` — ${j.message}`; } catch {}
    if (res.status === 429) detail = "Rate limited by the free Piston API — wait a few seconds and try again.";
    writeOutput([["out-stderr", "Execution service error: " + detail]]);
    setStatus("Run failed.");
    return;
  }

  const data = await res.json();
  const ms = Math.round(performance.now() - t0);
  const parts = [];

  // Compile step (for compiled languages) may carry errors.
  if (data.compile && (data.compile.stderr || data.compile.code !== 0)) {
    if (data.compile.stdout) parts.push(["out-stdout", data.compile.stdout]);
    if (data.compile.stderr) parts.push(["out-stderr", data.compile.stderr]);
  }

  const run = data.run || {};
  if (run.stdout) parts.push(["out-stdout", run.stdout]);
  if (run.stderr) parts.push(["out-stderr", run.stderr]);

  if (!parts.length) parts.push(["out-meta", "(no output)\n"]);

  const exit = run.code;
  const ok = (data.compile ? data.compile.code === 0 : true) && exit === 0;
  parts.push([ok ? "out-ok" : "out-meta",
    `\n${ok ? "✓" : "•"} exit code ${exit ?? "?"} · ${rt.language} ${rt.version} · ${ms} ms`]);

  writeOutput(parts);
  setStatus("Done.");
}

// A shared link (#lang=…&code=…) can still pre-fill the editor when opened.
function loadFromHash() {
  if (!location.hash) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  const lang = params.get("lang");
  const code = params.get("code");
  if (!lang || !LANGUAGES.find((l) => l.id === lang)) return null;
  let decoded = null;
  if (code) {
    try { decoded = decodeURIComponent(escape(atob(decodeURIComponent(code)))); } catch { decoded = null; }
  }
  return { lang, code: decoded };
}

// ----- Resizable divider -----
function setupDivider() {
  const divider = $("divider");
  const workspace = document.querySelector(".workspace");
  const editorPane = document.querySelector(".editor-pane");
  if (!divider) return;
  let dragging = false;
  divider.addEventListener("mousedown", () => { dragging = true; document.body.style.cursor = "col-resize"; });
  window.addEventListener("mouseup", () => { dragging = false; document.body.style.cursor = ""; });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = workspace.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    if (pct > 20 && pct < 85) {
      editorPane.style.flex = `1 1 ${pct}%`;
      if (editor) editor.layout();
    }
  });
}

// ----- Boot -----
function initEditor(value, lang) {
  require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } });
  require(["vs/editor/editor.main"], () => {
    editor = monaco.editor.create($("editor"), {
      value: value,
      language: lang,
      theme: "vs-dark",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      tabSize: 4,
      padding: { top: 12 },
      // Don't auto-insert the closing bracket/quote when you type an opening one.
      autoClosingBrackets: "never",
      autoClosingQuotes: "never",
      autoClosingOvertype: "never",
      autoSurround: "never",
    });
    // Ctrl/Cmd+Enter to run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
    // Live preview as you type for HTML and Web modes (debounced).
    let previewTimer = null;
    editor.onDidChangeModelContent(() => {
      if (currentLang.id !== "html" && currentLang.id !== "web") return;
      clearTimeout(previewTimer);
      previewTimer = setTimeout(
        () => (currentLang.id === "web" ? renderWeb() : renderHtml(editor.getValue())),
        250
      );
    });
    updateRuntimeBadge();
    updateIoMode();
    setStatus("Editor ready.");
  });
}

async function loadRuntimes() {
  try {
    const res = await fetch(`${PISTON}/runtimes`);
    runtimes = await res.json();
    updateRuntimeBadge();
  } catch {
    // Piston unreachable — local languages still run.
  }
}

function boot() {
  buildLanguageOptions();

  const fromHash = loadFromHash();
  if (fromHash) {
    currentLang = LANGUAGES.find((l) => l.id === fromHash.lang) || LANGUAGES[0];
  }
  languageSelect.value = currentLang.id;
  fileNameEl.textContent = currentLang.file;
  $("webTabs").classList.toggle("hidden", currentLang.id !== "web");

  let initialValue, initialLang;
  if (currentLang.id === "web") {
    if (fromHash && fromHash.code) {
      try { Object.assign(webFiles, JSON.parse(fromHash.code)); } catch {}
    }
    currentWebPart = "html";
    setActiveWebTab();
    initialValue = webFiles.html;
    initialLang = "html";
  } else {
    initialValue = fromHash && fromHash.code != null ? fromHash.code : "";
    initialLang = currentLang.monaco;
  }

  initEditor(initialValue, initialLang);
  loadRuntimes();
  setupDivider();

  // Warm up Python in the background so its first run feels instant.
  setTimeout(() => { getPyodide().catch(() => {}); }, 1200);

  languageSelect.addEventListener("change", (e) => selectLanguage(e.target.value));
  runBtn.addEventListener("click", runCode);
  document.querySelectorAll(".web-tab").forEach((btn) =>
    btn.addEventListener("click", () => switchWebPart(btn.dataset.part)));

  // global Ctrl/Cmd+Enter even when focus is in stdin
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCode(); }
  });
}

boot();
