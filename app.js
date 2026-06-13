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
 *  - sample:   a "hello world" starter snippet
 * JavaScript is special-cased to run natively in the browser (piston: null).
 */
const LANGUAGES = [
  {
    id: "python", label: "Python", monaco: "python",
    piston: ["python", "python3"], file: "main.py",
    sample: `# Python\nname = input("What's your name? ") or "world"\nprint(f"Hello, {name}!")\n\nfor i in range(1, 6):\n    print(i, i ** 2)\n`
  },
  {
    id: "javascript", label: "JavaScript", monaco: "javascript",
    piston: null, file: "main.js",
    sample: `// JavaScript runs natively in your browser.\nconsole.log("Hello from JavaScript!");\n\nconst squares = [1, 2, 3, 4, 5].map(n => n * n);\nconsole.log("Squares:", squares);\n`
  },
  {
    id: "typescript", label: "TypeScript", monaco: "typescript",
    piston: ["typescript", "ts"], file: "main.ts",
    sample: `// TypeScript\nfunction greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\nconsole.log(greet("TypeScript"));\n`
  },
  {
    id: "cpp", label: "C++", monaco: "cpp",
    piston: ["c++", "cpp"], file: "main.cpp",
    sample: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello from C++!" << endl;\n    for (int i = 1; i <= 5; i++) cout << i * i << " ";\n    cout << endl;\n    return 0;\n}\n`
  },
  {
    id: "c", label: "C", monaco: "c",
    piston: ["c"], file: "main.c",
    sample: `#include <stdio.h>\n\nint main(void) {\n    printf("Hello from C!\\n");\n    for (int i = 1; i <= 5; i++) printf("%d ", i * i);\n    printf("\\n");\n    return 0;\n}\n`
  },
  {
    id: "csharp", label: "C#", monaco: "csharp",
    piston: ["csharp", "c#", "csharp.net", "mono"], file: "main.cs",
    sample: `using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello from C#!");\n        for (int i = 1; i <= 5; i++) Console.Write($"{i * i} ");\n        Console.WriteLine();\n    }\n}\n`
  },
  {
    id: "java", label: "Java", monaco: "java",
    piston: ["java"], file: "Main.java",
    sample: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n        for (int i = 1; i <= 5; i++) System.out.print(i * i + " ");\n        System.out.println();\n    }\n}\n`
  },
  {
    id: "go", label: "Go", monaco: "go",
    piston: ["go", "golang"], file: "main.go",
    sample: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Go!")\n    for i := 1; i <= 5; i++ {\n        fmt.Print(i*i, " ")\n    }\n    fmt.Println()\n}\n`
  },
  {
    id: "rust", label: "Rust", monaco: "rust",
    piston: ["rust"], file: "main.rs",
    sample: `fn main() {\n    println!("Hello from Rust!");\n    for i in 1..=5 {\n        print!("{} ", i * i);\n    }\n    println!();\n}\n`
  },
  {
    id: "ruby", label: "Ruby", monaco: "ruby",
    piston: ["ruby"], file: "main.rb",
    sample: `puts "Hello from Ruby!"\n(1..5).each { |i| print i * i, " " }\nputs\n`
  },
  {
    id: "php", label: "PHP", monaco: "php",
    piston: ["php"], file: "main.php",
    sample: `<?php\necho "Hello from PHP!\\n";\nfor ($i = 1; $i <= 5; $i++) echo $i * $i, " ";\necho "\\n";\n`
  },
  {
    id: "kotlin", label: "Kotlin", monaco: "kotlin",
    piston: ["kotlin"], file: "main.kt",
    sample: `fun main() {\n    println("Hello from Kotlin!")\n    for (i in 1..5) print("\${i * i} ")\n    println()\n}\n`
  },
  {
    id: "swift", label: "Swift", monaco: "swift",
    piston: ["swift"], file: "main.swift",
    sample: `print("Hello from Swift!")\nfor i in 1...5 { print(i * i, terminator: " ") }\nprint()\n`
  },
  {
    id: "bash", label: "Bash", monaco: "shell",
    piston: ["bash", "sh"], file: "main.sh",
    sample: `#!/usr/bin/env bash\necho "Hello from Bash!"\nfor i in 1 2 3 4 5; do\n  echo -n "$((i * i)) "\ndone\necho\n`
  },
];

// ----- DOM refs -----
const $ = (id) => document.getElementById(id);
const languageSelect = $("languageSelect");
const runBtn = $("runBtn");
const resetBtn = $("resetBtn");
const shareBtn = $("shareBtn");
const clearBtn = $("clearBtn");
const stdinEl = $("stdin");
const outputEl = $("output");
const statusBar = $("statusBar");
const runtimeBadge = $("runtimeBadge");
const fileNameEl = $("fileName");

let editor = null;          // Monaco editor instance
let runtimes = [];          // resolved Piston runtimes
let currentLang = LANGUAGES[0];
const codeCache = {};        // remember per-language edits during the session
let pyodideReady = null;     // lazy-loaded Pyodide (in-browser Python) promise

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
  if (currentLang.id === "javascript") {
    runtimeBadge.textContent = "browser engine";
    return;
  }
  if (currentLang.id === "python") {
    runtimeBadge.textContent = pyodideReady ? "Python · in-browser" : "Python · in-browser (loads on first run)";
    return;
  }
  if (currentLang.id === "typescript") {
    runtimeBadge.textContent = tsReady ? "TypeScript · in-browser" : "TypeScript · in-browser (loads on first run)";
    return;
  }
  if (!runtimes.length) {
    runtimeBadge.textContent = "loading runtimes…";
    return;
  }
  const rt = pistonRuntimeFor(currentLang);
  runtimeBadge.textContent = rt ? `${rt.language} ${rt.version}` : "runtime unavailable";
}

function selectLanguage(id, { useSampleIfEmpty = true } = {}) {
  // stash the code we're leaving
  if (editor && currentLang) codeCache[currentLang.id] = editor.getValue();

  currentLang = LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];
  languageSelect.value = currentLang.id;
  fileNameEl.textContent = currentLang.file;

  const cached = codeCache[currentLang.id];
  const value = cached != null ? cached : (useSampleIfEmpty ? currentLang.sample : "");
  if (editor) {
    monaco.editor.setModelLanguage(editor.getModel(), currentLang.monaco);
    editor.setValue(value);
  }
  updateRuntimeBadge();
}

// ----- Running code -----
async function runCode() {
  const code = editor ? editor.getValue() : "";
  const stdin = stdinEl.value;
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
    setStatus("Loading the Python runtime once (~10 MB)… future runs are instant.");
    writeOutput([["out-meta", "⏳ First Python run: downloading the in-browser Python runtime once…"]]);
    runtimeBadge.textContent = "Python · loading…";
    pyodideReady = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" })
      .then((py) => { runtimeBadge.textContent = "Python · in-browser"; return py; })
      .catch((err) => { pyodideReady = null; throw err; });
  }
  return pyodideReady;
}

async function runPython(code, stdin, t0) {
  const py = await getPyodide();
  const startedAt = performance.now();
  const out = [];

  py.setStdout({ batched: (s) => out.push(["out-stdout", s + "\n"]) });
  py.setStderr({ batched: (s) => out.push(["out-stderr", s + "\n"]) });

  // Feed the whole stdin box on first read, then signal EOF.
  let stdinSent = false;
  py.setStdin({
    stdin: () => { if (stdinSent) return null; stdinSent = true; return stdin || ""; },
  });

  writeOutput([["out-meta", "⏳ Running Python in your browser…"]]);
  try {
    await py.runPythonAsync(code);
    const ms = Math.round(performance.now() - startedAt);
    if (!out.length) out.push(["out-meta", "(no output)\n"]);
    out.push(["out-ok", `\n✓ finished in ${ms} ms (in-browser Python, no limits)`]);
    writeOutput(out);
    setStatus("Done.");
  } catch (err) {
    out.push(["out-stderr", "\n" + (err && err.message ? err.message : String(err))]);
    writeOutput(out);
    setStatus("Python raised an error.");
  }
}

async function runViaPiston(code, stdin, t0) {
  const rt = pistonRuntimeFor(currentLang);
  if (!rt) {
    writeOutput([["out-stderr",
      `No runtime available for ${currentLang.label}. The Piston service may not support it right now.`]]);
    setStatus("Runtime unavailable.");
    return;
  }

  setStatus(`Compiling & running ${currentLang.label} (${rt.language} ${rt.version})…`);
  writeOutput([["out-meta", "⏳ Sending to Piston…"]]);

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

// ----- Share / reset -----
function shareCode() {
  const code = editor ? editor.getValue() : "";
  const payload = encodeURIComponent(btoa(unescape(encodeURIComponent(code))));
  const url = `${location.origin}${location.pathname}#lang=${currentLang.id}&code=${payload}`;
  navigator.clipboard.writeText(url).then(
    () => setStatus("Shareable link copied to clipboard ✓"),
    () => setStatus("Couldn't copy — here's the link: " + url)
  );
}

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

function resetCode() {
  delete codeCache[currentLang.id];
  if (editor) editor.setValue(currentLang.sample);
  setStatus(`Reset ${currentLang.label} to the starter snippet.`);
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
function initEditor(initial) {
  require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } });
  require(["vs/editor/editor.main"], () => {
    editor = monaco.editor.create($("editor"), {
      value: initial.code != null ? initial.code : currentLang.sample,
      language: currentLang.monaco,
      theme: "vs-dark",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      tabSize: 4,
      padding: { top: 12 },
    });
    // Ctrl/Cmd+Enter to run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
    updateRuntimeBadge();
    setStatus("Editor ready.");
  });
}

async function loadRuntimes() {
  try {
    const res = await fetch(`${PISTON}/runtimes`);
    runtimes = await res.json();
    updateRuntimeBadge();
    setStatus("Runtimes loaded — ready to run.");
  } catch {
    runtimeBadge.textContent = "runtimes offline";
    setStatus("Couldn't reach the Piston API — JavaScript still runs locally.");
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

  initEditor(fromHash || {});
  loadRuntimes();
  setupDivider();

  languageSelect.addEventListener("change", (e) => selectLanguage(e.target.value));
  runBtn.addEventListener("click", runCode);
  resetBtn.addEventListener("click", resetCode);
  shareBtn.addEventListener("click", shareCode);
  clearBtn.addEventListener("click", clearOutput);

  // global Ctrl/Cmd+Enter even when focus is in stdin
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCode(); }
  });
}

boot();
